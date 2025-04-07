const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');
const dotenv = require('dotenv');
const cors = require('cors');
const pdfParse = require('pdf-parse');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Debug API key presence and format without exposing it
const apiKey = process.env.OPENAI_API_KEY;
console.log("API Key status:", apiKey ? "Key present" : "Key missing");
if (apiKey) {
    console.log("Key prefix:", apiKey.substring(0, 7));
    console.log("Key length:", apiKey.length);
}

// Initialize OpenAI with explicit configuration and fallbacks
const openai = new OpenAI({
    apiKey: apiKey || "MISSING_KEY",
    timeout: 60000, // 60 second timeout
    maxRetries: 2
});

// Utility function to test the API key
async function testApiKey() {
    if (!apiKey) {
        console.error("ERROR: No API key available");
        return false;
    }
    
    try {
        console.log("Testing API connection with a simple request...");
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // Using a widely available model for testing
            messages: [{ role: "user", content: "Hello" }],
            max_tokens: 5
        });
        console.log("API connection successful!");
        return true;
    } catch (error) {
        console.error("API connection failed:", error.message);
        if (error.message.includes("401")) {
            console.error("Authentication error. Your API key may be invalid or expired.");
        } else if (error.message.includes("model")) {
            console.error("Model availability error. Trying to use gpt-3.5-turbo instead.");
            // You could implement a fallback here
        }
        return false;
    }
}

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir);
        }
        cb(null, uploadsDir);
    },
    filename: function(req, file, cb) {
        // Create unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function(req, file, cb) {
        // Only allow PDFs
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Only PDF files are allowed'));
        }
        cb(null, true);
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // Limit file size to 10MB
    }
});

// Routes
app.post('/api/summarize', upload.single('file'), async (req, res) => {
    try {
        console.log('Summarize API called');
        
        if (!req.file) {
            console.log('No file uploaded');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('File uploaded:', req.file.path);

        // Parse PDF text
        const pdfBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdfParse(pdfBuffer);
        const pdfText = pdfData.text;

        console.log('PDF text extracted, length:', pdfText.length);

        // Verify API key before making OpenAI calls
        if (!apiKey) {
            throw new Error('OpenAI API key is missing. Please check your environment variables.');
        }

        // Try multiple fallback models if needed
        let validationResponse;
        const modelsToTry = ['gpt-4o-mini', 'gpt-3.5-turbo'];
        let success = false;
        let lastError = null;

        for (const model of modelsToTry) {
            if (success) break;
            
            try {
                console.log(`Trying to validate document with model: ${model}`);
                validationResponse = await openai.chat.completions.create({
                    model: model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a helpful assistant that can identify whether a document is a legislative bill or law. Provide a clear yes or no answer.'
                        },
                        {
                            role: 'user',
                            content: `Is the following document a legislative bill or law? Respond with only "Yes" or "No".\n\n${pdfText.substring(0, 9000)}`
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 10
                });
                success = true;
                console.log(`Successfully used model: ${model}`);
            } catch (error) {
                console.error(`Error with model ${model}:`, error.message);
                lastError = error;
                // Continue to next model
            }
        }

        if (!success) {
            throw new Error(`API authentication failed: ${lastError.message}`);
        }

        const isLegislation = validationResponse.choices[0].message.content.toLowerCase().includes('yes');
        console.log('Is legislation validation result:', isLegislation);

        if (!isLegislation) {
            // Delete the uploaded file
            fs.unlinkSync(req.file.path);
            
            return res.status(400).json({ 
                error: 'The uploaded document does not appear to be a legislative bill or law. This tool only summarizes legislation.'
            });
        }

        // First pass: Analyze bill based on text only
        console.log('Performing initial analysis of the bill...');
        
        // Apply the same fallback model approach for both API calls
        let initialAnalysis;
        success = false;
        
        for (const model of modelsToTry) {
            if (success) break;
            
            try {
                console.log(`Trying initial analysis with model: ${model}`);
                initialAnalysis = await openai.chat.completions.create({
                    model: model,
                    messages: [
                        {
                            role: 'system',
                            content: `You are a legislative analyst. Analyze the provided bill or law and extract the following information:
                            
                            1. Bill Number (billNumber) - include the exact bill number as shown in the document
                            2. Bill Name (billName) - include the full title as shown in the document
                            3. State (state) - the state the legislation has been proposed in
                            4. Year Introduced (yearIntroduced) - the year the bill was introduced
                            5. Sponsors (sponsors) - list all primary sponsors
                            6. Cosponsors (cosponsors) - list all cosponsors, if many, include all names
                            7. Committee (committee) - committee referred to
                            8. Summary (summary) - write at least 300 words summarizing the purpose and main provisions
                               - Include a detailed breakdown of each section of the bill
                               - Ensure the summary is comprehensive enough for a legislator to speak knowledgeably about the bill
                               - Highlight key provisions, requirements, and implications
                            9. Sections (sections) - array of objects, each with 'number' and 'description' properties
                            
                            Base your analysis ONLY on the text provided, without any external research. 
                            Provide the information in a JSON format with the exact field names shown in parentheses above.
                            Make sure the summary is thorough and detailed, at least 300 words long.
                            Do not use snake_case for field names - use the exact field names provided above.`
                        },
                        {
                            role: 'user',
                            content: pdfText
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 4000,
                    response_format: { type: 'json_object' }
                });
                success = true;
                console.log(`Successfully used model: ${model} for initial analysis`);
            } catch (error) {
                console.error(`Error with model ${model} for initial analysis:`, error.message);
                lastError = error;
                // Continue to next model
            }
        }

        if (!success) {
            throw new Error(`Initial analysis failed: ${lastError.message}`);
        }

        const initialData = JSON.parse(initialAnalysis.choices[0].message.content);
        console.log('Initial analysis complete:', initialData);

        // Second pass: Complete the analysis with additional research
        console.log('Performing research-based analysis...');
        
        let secondAnalysis;
        success = false;
        
        for (const model of modelsToTry) {
            if (success) break;
            
            try {
                console.log(`Trying research analysis with model: ${model}`);
                secondAnalysis = await openai.chat.completions.create({
                    model: model,
                    messages: [
                        {
                            role: 'system',
                            content: `You are a legislative analyst. You have been provided with the text of a bill or law and some initial analysis.
                            
                            CONDUCT THOROUGH RESEARCH to provide the following additional information:
                            
                            1. Financial implications or appropriations of the bill (financialImplications):
                               - Provide detailed information about the cost of implementation
                               - Include specific dollar amounts if available
                               - Describe funding mechanisms or sources mentioned
                               - Write at least 150 words on this topic
                            
                            2. Ideological leaning of the bill (ideologicalLeaning):
                               - Analyze whether the bill aligns with conservative, progressive, or moderate positions
                               - Explain the reasoning behind your analysis
                               - Identify the political philosophy or values reflected in the bill
                               - Write at least 150 words on this topic
                            
                            3. Different advocacy groups' positions on the bill (advocacyGroupPositions):
                               - Research specific advocacy groups that have taken positions on this bill
                               - For state bills, focus on relevant state-level advocacy groups
                               - Include both supporters and opponents of the bill when available
                               - Explain each group's reasoning for their position
                               - Write at least 200 words on this topic
                            
                            4. What the bill changes about existing law (changesTo):
                               - Describe the current legal status quo
                               - Explain specifically how this bill modifies, replaces, or adds to existing law
                               - Identify key changes and their significance
                               - Write at least 150 words on this topic
                            
                            5. Other states with similar laws on their books (similarLaws):
                               - Identify at least 3-5 states with similar legislation if they exist
                               - Include specific statute citations whenever possible
                               - Describe key similarities and differences between those laws and this bill
                               - Write at least 150 words on this topic
                            
                            6. Other factors to consider (otherFactors):
                               - Include any relevant information not covered in the above categories
                               - Discuss implementation challenges, legal concerns, or potential unintended consequences
                               - Address any controversial aspects of the bill
                               - Write at least 150 words on this topic
                            
                            Add "(AI)" at the end of any sentence that contains information from your research.
                            
                            Provide the information in a JSON format with the following fields:
                            - financialImplications (string)
                            - ideologicalLeaning (string)
                            - advocacyGroupPositions (string)
                            - changesTo (string)
                            - similarLaws (string)
                            - otherFactors (string)
                            - citations (an array of sources you used)
                            
                            Each string field should be a detailed paragraph of at least 150-200 words, NOT an object or nested structure.`
                        },
                        {
                            role: 'user',
                            content: `Bill information:\n${JSON.stringify(initialData, null, 2)}\n\nOriginal Bill Text:\n${pdfText.substring(0, 8000)}\n\nIMPORTANT: Each of the strings in your response (financialImplications, ideologicalLeaning, etc.) should be a detailed paragraph of at least 150-200 words, NOT an object or nested structure. Make sure your response is properly formatted as a flat JSON object with string values, not nested objects.`
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 4000,
                    response_format: { type: 'json_object' }
                });
                success = true;
                console.log(`Successfully used model: ${model} for research analysis`);
            } catch (error) {
                console.error(`Error with model ${model} for research analysis:`, error.message);
                lastError = error;
                // Continue to next model
            }
        }

        if (!success) {
            throw new Error(`Research analysis failed: ${lastError.message}`);
        }

        // Parse the JSON response, handling potential errors
        let researchData;
        try {
            researchData = JSON.parse(secondAnalysis.choices[0].message.content);
            console.log('Research-based analysis complete');
            
            // Validate that the research data is properly formatted
            const expectedFields = ['financialImplications', 'ideologicalLeaning', 'advocacyGroupPositions', 
                                   'changesTo', 'similarLaws', 'otherFactors', 'citations'];
            
            for (const field of expectedFields) {
                // Check if the field exists and is not an object
                if (researchData[field] === undefined) {
                    console.log(`Missing field in research data: ${field}`);
                    researchData[field] = `Information about ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} is not available at this time.`;
                } else if (typeof researchData[field] === 'object' && !Array.isArray(researchData[field])) {
                    console.log(`Field is an object instead of string: ${field}`);
                    researchData[field] = `Information about ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} is not properly formatted. Please review the bill text for details.`;
                }
            }
            
        } catch (error) {
            console.error('Error parsing research data:', error);
            // Provide default values if parsing fails
            researchData = {
                financialImplications: "The financial implications could not be determined at this time.",
                ideologicalLeaning: "The ideological leaning could not be determined at this time.",
                advocacyGroupPositions: "Information on advocacy group positions could not be determined at this time.",
                changesTo: "The changes to existing law could not be determined at this time.",
                similarLaws: "Information on similar laws in other states could not be determined at this time.",
                otherFactors: "Additional factors to consider could not be determined at this time.",
                citations: []
            };
        }

        // Combine the data from both analyses
        const combinedData = {
            billNumber: initialData.billNumber,
            billName: initialData.billName,
            state: initialData.state,
            yearIntroduced: initialData.yearIntroduced,
            sponsors: initialData.sponsors,
            cosponsors: initialData.cosponsors,
            committee: initialData.committee,
            summary: initialData.summary,
            sections: initialData.sections || [],
            financialImplications: researchData.financialImplications,
            ideologicalLeaning: researchData.ideologicalLeaning,
            advocacyGroupPositions: researchData.advocacyGroupPositions,
            changesTo: researchData.changesTo,
            similarLaws: researchData.similarLaws,
            otherFactors: researchData.otherFactors,
            citations: researchData.citations || []
        };

        // Delete the uploaded file after processing
        fs.unlinkSync(req.file.path);
        
        console.log('Sending combined results to client');
        res.json(combinedData);
    } catch (error) {
        console.error('Error processing file:', error);
        
        // Clean up the uploaded file if it exists
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ error: 'Error processing file: ' + error.message });
    }
});

// Add a dedicated endpoint to check API key status
app.get('/api/check-key', async (req, res) => {
    const keyStatus = await testApiKey();
    res.json({
        status: keyStatus ? 'valid' : 'invalid',
        message: keyStatus ? 'API key is working correctly' : 'API key is invalid or missing'
    });
});

// Rest of your routes...
app.post('/api/search', async (req, res) => {
    // Your existing code...
    try {
        // Similar model fallback approach here...
        res.json({}); // Replace with your actual response
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Simple health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        apiKeyPresent: !!apiKey,
        nodeEnv: process.env.NODE_ENV || 'development'
    });
});

// Add fallback for uploads directory
app.use('/uploads', (req, res, next) => {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir);
    }
    next();
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'An unexpected error occurred on the server',
        message: err.message
    });
});

// Start the server with API key verification
app.listen(port, async () => {
    console.log(`Server running on port ${port}`);
    console.log(`Open your browser and navigate to http://localhost:${port}`);
    console.log(`API endpoints available at:`);
    console.log(`- POST /api/summarize (for bill analysis)`);
    console.log(`- POST /api/search (for bill search)`);
    console.log(`- GET /api/health (for server health check)`);
    console.log(`- GET /api/check-key (for API key verification)`);
    
    // Make sure uploads directory exists
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir);
        console.log('Created uploads directory');
    }
    
    // Test API key on startup
    const apiKeyValid = await testApiKey();
    if (!apiKeyValid) {
        console.warn("\nWARNING: Your OpenAI API key may be invalid or missing!");
        console.warn("The application will start but API calls will fail.");
        console.warn("Please check your environment variables and make sure OPENAI_API_KEY is set correctly.");
    } else {
        console.log("\nAPI key verification successful! The application is ready to use.");
    }
});
