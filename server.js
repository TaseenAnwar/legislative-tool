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

// Check for API key presence
if (!process.env.OPENAI_API_KEY) {
    console.error("ERROR: OpenAI API key is missing! Make sure OPENAI_API_KEY is set in your environment variables.");
    // Continue execution, but the application will fail on API calls
}

// Initialize OpenAI with better error handling
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Log API key status (not the actual key)
console.log("API Key status:", process.env.OPENAI_API_KEY ? "Key is present" : "No API key found");

// Add a function to test the API key
async function testApiKey() {
    try {
        console.log("Testing OpenAI API connection...");
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: "Hello" }],
            max_tokens: 5
        });
        console.log("API connection successful!");
        return true;
    } catch (error) {
        console.error("OpenAI API connection failed:", error.message);
        if (error.status === 401) {
            console.error("Authentication error: Your API key may be invalid or expired.");
        }
        return false;
    }
}

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

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
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API key is missing. Please check your environment variables.');
        }

        // First query to GPT-4o-mini to check if document is a bill or law
        console.log('Validating if document is a bill or law...');
        
        let validationResponse;
        try {
            validationResponse = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
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
        } catch (error) {
            console.error('Error during API call:', error);
            if (error.status === 401) {
                throw new Error('Authentication failed: Your OpenAI API key is invalid or expired. Please check your environment variables.');
            } else {
                throw new Error(`OpenAI API error: ${error.message}`);
            }
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
        
        const initialAnalysis = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
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

        const initialData = JSON.parse(initialAnalysis.choices[0].message.content);
        console.log('Initial analysis complete:', initialData);

        // Second pass: Complete the analysis with additional research
        console.log('Performing research-based analysis...');
        
        const secondAnalysis = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
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

app.post('/api/search', async (req, res) => {
    try {
        console.log('Search API called with data:', req.body);
        
        const { billName, billNumber, billState, billYear, additionalInfo } = req.body;

        if (!billState) {
            return res.status(400).json({ error: 'State or federal jurisdiction is required' });
        }

        if (!billName && !billNumber && !additionalInfo) {
            return res.status(400).json({ error: 'Please provide at least one piece of information about the bill' });
        }

        // Verify API key before making OpenAI calls
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OpenAI API key is missing. Please check your environment variables.');
        }

        // Create search prompt
        console.log('Sending search request to OpenAI...');
        
        const searchPrompt = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a legislative research assistant. Your task is to search for information about a legislative bill based on the details provided.
                    
                    FIND AND RESEARCH A SPECIFIC BILL matching the criteria provided. Then provide the following information:
                    
                    1. Basic bill information:
                       - Bill Number (billNumber) - exact bill number
                       - Bill Name (billName) - full title
                       - State (state) - the state or federal jurisdiction
                       - Year Introduced (yearIntroduced) - the year the bill was introduced
                       - Sponsors (sponsors) - list all primary sponsors
                       - Cosponsors (cosponsors) - list all cosponsors
                       - Committee (committee) - committee referred to
                    
                    2. Bill summary:
                       - Write at least 300 words summarizing the bill's purpose and provisions
                       - Include a detailed breakdown of each section
                       - Ensure the summary is comprehensive enough for a legislator to speak knowledgeably about it
                       - Highlight key provisions, requirements, and implications
                    
                    3. Financial implications (write at least 150 words)
                    
                    4. Ideological leaning (write at least 150 words)
                    
                    5. Advocacy group positions (write at least 200 words)
                    
                    6. Changes to existing law (write at least 150 words)
                    
                    7. Similar laws in other states (write at least 150 words)
                    
                    8. Other factors to consider (write at least 150 words)
                    
                    For basic information (items #1-2), RESTRICT your research to:
                    - Official state legislature websites
                    - Congress.gov
                    - U.S. House and Senate websites
                    - Legiscan.com
                    - Billtrack50.com
                    
                    For items #3-8, you may use any reliable source.
                    
                    Include citations for all information. Format your response as a JSON object with the following fields:
                    - billNumber (string)
                    - billName (string)
                    - state (string)
                    - yearIntroduced (string or number)
                    - sponsors (string or array of strings)
                    - cosponsors (string or array of strings)
                    - committee (string)
                    - summary (string, at least 300 words)
                    - financialImplications (string, at least 150 words)
                    - ideologicalLeaning (string, at least 150 words)
                    - advocacyGroupPositions (string, at least 200 words)
                    - changesTo (string, at least 150 words)
                    - similarLaws (string, at least 150 words)
                    - otherFactors (string, at least 150 words)
                    - citations (array of strings)
                    
                    IMPORTANT: Each of the string fields should be a detailed paragraph, NOT an object or nested structure.`
                },
                {
                    role: 'user',
                    content: `Please search for information about the following bill:
                    
                    ${billName ? `Bill Name: ${billName}` : ''}
                    ${billNumber ? `Bill Number: ${billNumber}` : ''}
                    Jurisdiction: ${billState === 'federal' ? 'Federal (United States)' : billState}
                    ${billYear ? `Year Introduced: ${billYear}` : ''}
                    ${additionalInfo ? `Additional Information: ${additionalInfo}` : ''}
                    
                    ${billYear ? `IMPORTANT: Only return results for bills introduced in ${billYear}. Do not include bills from other years.` : ''}
                    
                    Provide comprehensive information as specified in the instructions.`
                }
            ],
            temperature: 0.3,
            max_tokens: 4000,
            response_format: { type: 'json_object' }
        });

        // Parse the JSON response and validate its structure
        let searchData;
        try {
            searchData = JSON.parse(searchPrompt.choices[0].message.content);
            console.log('Search results received from OpenAI');
            
            // If year was specified, verify the result matches
            if (billYear && searchData.yearIntroduced) {
                const resultYear = String(searchData.yearIntroduced);
                const requestedYear = String(billYear);
                
                if (resultYear !== requestedYear) {
                    return res.status(400).json({
                        error: `No bill matching your criteria was found for the year ${billYear}. The search found a bill from ${resultYear} instead. Please try again with different search parameters or without specifying a year.`
                    });
                }
            }
            
            // Validate that required fields are present and have appropriate values
            const requiredStringFields = [
                'billNumber', 'billName', 'state', 'committee', 'summary',
                'financialImplications', 'ideologicalLeaning', 'advocacyGroupPositions',
                'changesTo', 'similarLaws', 'otherFactors'
            ];
            
            for (const field of requiredStringFields) {
                if (!searchData[field]) {
                    searchData[field] = `Information about ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} could not be found.`;
                } else if (typeof searchData[field] === 'object') {
                    searchData[field] = `Information about ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} is not available in the correct format.`;
                }
            }
            
            // Ensure arrays are properly handled
            if (!searchData.citations || !Array.isArray(searchData.citations)) {
                searchData.citations = [];
            }
            
            // Handle sponsors and cosponsors which can be arrays or strings
            if (!searchData.sponsors) {
                searchData.sponsors = 'Not specified';
            }
            
            if (!searchData.cosponsors) {
                searchData.cosponsors = 'Not specified';
            }
            
        } catch (error) {
            console.error('Error parsing search data:', error);
            return res.status(500).json({ 
                error: 'Unable to find complete information about this bill. Please try with more specific details.'
            });
        }
        
        res.json(searchData);
    } catch (error) {
        console.error('Error searching for bill:', error);
        res.status(500).json({ error: 'Error searching for bill: ' + error.message });
    }
});

// Simple health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Add API key verification endpoint
app.get('/api/verify-key', async (req, res) => {
    const keyStatus = await testApiKey();
    res.json({ 
        status: keyStatus ? 'ok' : 'error',
        message: keyStatus ? 'API key is valid' : 'API key is invalid or missing'
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
    console.log(`- GET /api/verify-key (for API key verification)`);
    
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
