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

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

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
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Parse PDF text
        const pdfBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdfParse(pdfBuffer);
        const pdfText = pdfData.text;

        // Delete the uploaded file after parsing
        fs.unlinkSync(req.file.path);

        // First query to GPT-4o-mini to check if document is a bill or law
        const validationResponse = await openai.chat.completions.create({
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

        const isLegislation = validationResponse.choices[0].message.content.toLowerCase().includes('yes');

        if (!isLegislation) {
            return res.status(400).json({ 
                error: 'The uploaded document does not appear to be a legislative bill or law. This tool only summarizes legislation.'
            });
        }

        // First pass: Analyze bill based on text only
        const initialAnalysis = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a legislative analyst. Analyze the provided bill or law and extract the following information:
                    
                    1. The Bill Number
                    2. The Bill Name
                    3. The state the legislation has been proposed in
                    4. The year the bill was introduced
                    5. Bill sponsor(s)
                    6. Bill cosponsor(s)
                    7. Committee referred to
                    8. Summary of what the bill does, including a breakdown of the sections of the bill if applicable
                    
                    Base your analysis ONLY on the text provided, without any external research. Provide the information in a JSON format.`
                },
                {
                    role: 'user',
                    content: pdfText
                }
            ],
            temperature: 0.3,
            max_tokens: 2500,
            response_format: { type: 'json_object' }
        });

        const initialData = JSON.parse(initialAnalysis.choices[0].message.content);

        // Second pass: Complete the analysis with additional research
        const secondAnalysis = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a legislative analyst. You have been provided with the text of a bill or law and some initial analysis.
                    
                    Now, CONDUCT RESEARCH to provide the following additional information:
                    
                    1. Financial implications or appropriations of the bill
                    2. Ideological leaning of the bill
                    3. Different advocacy groups' positions on the bill (focus on state-specific groups if relevant)
                    4. What the bill changes about existing law
                    5. Other states with a similar law (including statute citations)
                    6. Other important factors to consider
                    
                    Add "(AI)" at the end of any sentence that contains information from your research.
                    
                    Provide the information in a JSON format with the following fields:
                    - financialImplications
                    - ideologicalLeaning
                    - advocacyGroupPositions
                    - changesTo
                    - similarLaws
                    - otherFactors
                    - citations (an array of sources you used)`
                },
                {
                    role: 'user',
                    content: `Bill information:\n${JSON.stringify(initialData, null, 2)}\n\nOriginal Bill Text:\n${pdfText.substring(0, 8000)}`
                }
            ],
            temperature: 0.3,
            max_tokens: 2500,
            response_format: { type: 'json_object' }
        });

        const researchData = JSON.parse(secondAnalysis.choices[0].message.content);

        // Combine the data from both analyses
        const combinedData = {
            ...initialData,
            ...researchData
        };

        res.json(combinedData);
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ error: 'Error processing file: ' + error.message });
    }
});

app.post('/api/search', async (req, res) => {
    try {
        const { billName, billNumber, billState, additionalInfo } = req.body;

        if (!billState) {
            return res.status(400).json({ error: 'State or federal jurisdiction is required' });
        }

        if (!billName && !billNumber && !additionalInfo) {
            return res.status(400).json({ error: 'Please provide at least one piece of information about the bill' });
        }

        // Create search prompt
        const searchPrompt = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a legislative research assistant. Your task is to search for information about a legislative bill based on the details provided. Focus on finding accurate information from reliable sources.
                    
                    For basic information about the bill (bill number, name, state, year, sponsors, cosponsors, committee, and summary), RESTRICT your research to the following sources:
                    - Official state legislature websites
                    - Congress.gov
                    - U.S. House of Representatives website
                    - U.S. Senate website
                    - Legiscan.com
                    - Billtrack50.com
                    
                    For other aspects of the bill (financial implications, ideological leaning, advocacy positions, changes to law, similar laws, and other factors), you may use any reliable source.
                    
                    Include citations for all information. Format your response as a JSON object.`
                },
                {
                    role: 'user',
                    content: `Please search for information about the following bill:
                    
                    ${billName ? `Bill Name: ${billName}` : ''}
                    ${billNumber ? `Bill Number: ${billNumber}` : ''}
                    Jurisdiction: ${billState === 'federal' ? 'Federal (United States)' : billState}
                    ${additionalInfo ? `Additional Information: ${additionalInfo}` : ''}
                    
                    Please provide as much detail as possible about this bill.`
                }
            ],
            temperature: 0.3,
            max_tokens: 3000,
            response_format: { type: 'json_object' }
        });

        const searchData = JSON.parse(searchPrompt.choices[0].message.content);

        res.json(searchData);
    } catch (error) {
        console.error('Error searching for bill:', error);
        res.status(500).json({ error: 'Error searching for bill: ' + error.message });
    }
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
