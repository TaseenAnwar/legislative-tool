document.addEventListener('DOMContentLoaded', function() {
    // Store references to elements we'll need later
    const summaryContent = document.getElementById('summary-content');
    const searchContent = document.getElementById('search-content');
    
    // Tab Switching Functionality
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            console.log('Tab clicked:', button.getAttribute('data-tab'));
            
            // Remove active class from all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to current tab
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            if (tabContent) {
                tabContent.classList.add('active');
            } else {
                console.error('Tab content not found:', tabId);
            }
        });
    });

    // File Upload Display
    const fileInput = document.getElementById('bill-pdf');
    const fileNameDisplay = document.getElementById('file-name-display');

    if (fileInput && fileNameDisplay) {
        fileInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                const fileName = this.files[0].name;
                fileNameDisplay.textContent = `Selected file: ${fileName}`;
                fileNameDisplay.style.color = '#27ae60';
                console.log('File selected:', fileName);
            } else {
                fileNameDisplay.textContent = '';
            }
        });
    } else {
        console.error('File input or display element not found');
    }

    // Bill Summarizer Form Submission
    const summarizerForm = document.getElementById('summarizer-form');
    
    if (summarizerForm) {
        const summarizerLoadingIndicator = document.querySelector('#summarizer .loading-indicator');
        const summaryResults = document.getElementById('summary-results');

        summarizerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            console.log('Summarizer form submitted');
            
            const fileInput = document.getElementById('bill-pdf');
            if (!fileInput.files || !fileInput.files[0]) {
                alert('Please select a PDF file');
                return;
            }

            // Hide form, show loading indicator
            summarizerForm.classList.add('hidden');
            summarizerLoadingIndicator.classList.remove('hidden');

            try {
                // Create FormData object for file upload
                const formData = new FormData();
                formData.append('file', fileInput.files[0]);

                console.log('Sending file to server...');
                
                // Send request to server
                const response = await fetch('/api/summarize', {
                    method: 'POST',
                    body: formData
                });

                console.log('Response received:', response.status);
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Server responded with an error');
                }

                const data = await response.json();
                console.log('Data received:', data);
                
                // Format and display the results
                displayBillSummary(data);
                
                // Hide loading indicator, show results
                summarizerLoadingIndicator.classList.add('hidden');
                summaryResults.classList.remove('hidden');
            } catch (error) {
                console.error('Error:', error);
                alert('An error occurred while analyzing the bill: ' + error.message);
                
                // Hide loading indicator, show form again
                summarizerLoadingIndicator.classList.add('hidden');
                summarizerForm.classList.remove('hidden');
            }
        });
    } else {
        console.error('Summarizer form not found');
    }

    // Bill Searcher Form Submission
    const searcherForm = document.getElementById('searcher-form');
    
    if (searcherForm) {
        const searcherLoadingIndicator = document.querySelector('#searcher .loading-indicator');
        const searchResults = document.getElementById('search-results');

        searcherForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            console.log('Searcher form submitted');
            
            const billName = document.getElementById('bill-name').value;
            const billNumber = document.getElementById('bill-number').value;
            const billState = document.getElementById('bill-state').value;
            const billYear = document.getElementById('bill-year').value;
            const additionalInfo = document.getElementById('additional-info').value;

            if (!billState) {
                alert('Please select a state or federal jurisdiction');
                return;
            }

            if (!billName && !billNumber && !additionalInfo) {
                alert('Please provide at least one piece of information about the bill');
                return;
            }

            // Hide form, show loading indicator
            searcherForm.classList.add('hidden');
            searcherLoadingIndicator.classList.remove('hidden');

            try {
                console.log('Sending search request to server...');
                
                // Send request to server
                const response = await fetch('/api/search', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        billName,
                        billNumber,
                        billState,
                        billYear,
                        additionalInfo
                    })
                });

                console.log('Response received:', response.status);
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Server responded with an error');
                }

                const data = await response.json();
                console.log('Data received:', data);
                
                // Format and display the results
                displayBillSearch(data);
                
                // Hide loading indicator, show results
                searcherLoadingIndicator.classList.add('hidden');
                searchResults.classList.remove('hidden');
            } catch (error) {
                console.error('Error:', error);
                alert('An error occurred while searching for the bill: ' + error.message);
                
                // Hide loading indicator, show form again
                searcherLoadingIndicator.classList.add('hidden');
                searcherForm.classList.remove('hidden');
            }
        });
    } else {
        console.error('Searcher form not found');
    }

    // "Back" button functionality
    const backToSummarizerBtn = document.getElementById('back-to-summarizer');
    if (backToSummarizerBtn) {
        backToSummarizerBtn.addEventListener('click', function() {
            document.getElementById('summary-results').classList.add('hidden');
            document.getElementById('summarizer-form').classList.remove('hidden');
            document.getElementById('bill-pdf').value = '';
            document.getElementById('file-name-display').textContent = '';
        });
    }

    const backToSearcherBtn = document.getElementById('back-to-searcher');
    if (backToSearcherBtn) {
        backToSearcherBtn.addEventListener('click', function() {
            document.getElementById('search-results').classList.add('hidden');
            document.getElementById('searcher-form').classList.remove('hidden');
        });
    }

    // Function to safely get a value from a potentially nested object
    function safeGet(obj, keys, defaultValue = 'Not specified') {
        if (!obj) return defaultValue;
        
        // Handle array of keys or string patterns
        if (Array.isArray(keys)) {
            for (const key of keys) {
                if (obj[key] !== undefined && obj[key] !== null) {
                    return obj[key];
                }
            }
            return defaultValue;
        }
        
        // Handle single key
        return obj[keys] !== undefined && obj[keys] !== null ? obj[keys] : defaultValue;
    }

    // Function to format array or string
    function formatList(value, defaultValue = 'Not specified') {
        if (!value) return defaultValue;
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        return value;
    }

    // Function to display bill summary results
    function displayBillSummary(data) {
        // Clear previous content
        if (!summaryContent) {
            console.error('Summary content element not found');
            return;
        }
        
        summaryContent.innerHTML = '';

        // Log the data structure to help with debugging
        console.log('Displaying bill summary with data:', JSON.stringify(data, null, 2));
        
        // Create HTML content for the summary
        let htmlContent = '';

        // Basic bill information - check for both camelCase and snake_case keys
        const billNumber = safeGet(data, ['billNumber', 'bill_number', 'BillNumber', 'Bill Number']);
        const billName = safeGet(data, ['billName', 'bill_name', 'BillName', 'Bill Name']);
        const state = safeGet(data, ['state', 'State']);
        const yearIntroduced = safeGet(data, ['yearIntroduced', 'year_introduced', 'YearIntroduced', 'Year Introduced']);

        htmlContent += createSection('Bill Information', `
            <p><strong>Bill Number:</strong> ${billNumber}</p>
            <p><strong>Bill Name:</strong> ${billName}</p>
            <p><strong>State:</strong> ${state}</p>
            <p><strong>Year Introduced:</strong> ${yearIntroduced}</p>
        `);

        // Sponsors and Committee
        const sponsors = safeGet(data, ['sponsors', 'bill_sponsors', 'BillSponsor', 'Bill Sponsor', 'Bill Sponsor(s)']);
        const cosponsors = safeGet(data, ['cosponsors', 'bill_cosponsors', 'BillCosponsors', 'Bill Cosponsors', 'Bill Cosponsor(s)']);
        const committee = safeGet(data, ['committee', 'committee_referred_to', 'CommitteeReferredTo', 'Committee Referred To']);

        htmlContent += createSection('Sponsors & Committee', `
            <p><strong>Sponsor(s):</strong> ${formatList(sponsors)}</p>
            <p><strong>Co-sponsor(s):</strong> ${formatList(cosponsors)}</p>
            <p><strong>Committee Referred to:</strong> ${committee}</p>
        `);

        // Bill Summary
        let summaryText = '';
        
        // Try to extract summary from different possible structures
        if (data.summary) {
            if (typeof data.summary === 'string') {
                summaryText = data.summary;
            } else if (typeof data.summary === 'object') {
                if (data.summary.description) {
                    summaryText = data.summary.description;
                } else if (data.summary.Purpose) {
                    summaryText = data.summary.Purpose;
                }
            }
        } else if (data.Summary) {
            if (typeof data.Summary === 'string') {
                summaryText = data.Summary;
            } else if (typeof data.Summary === 'object') {
                if (data.Summary.Purpose) {
                    summaryText = data.Summary.Purpose;
                } else if (data.Summary.description) {
                    summaryText = data.Summary.description;
                }
            }
        }
        
        // Add bill sections to the summary if available
        let sectionsText = '';
        let sectionsFound = false;
        
        // Try different section formats
        const sections = data.sections || data.summary?.sections || data.Summary?.sections || data.Summary?.Sections;
        
        if (sections) {
            sectionsFound = true;
            sectionsText += '<p><strong>Bill Sections:</strong></p><ul>';
            
            if (Array.isArray(sections)) {
                sections.forEach((section, index) => {
                    const sectionTitle = section.title || section.number || `Section ${index + 1}`;
                    const sectionContent = section.content || section.description || section.Description || 
                                          (typeof section === 'string' ? section : JSON.stringify(section));
                    sectionsText += `<li><strong>${sectionTitle}:</strong> ${sectionContent}</li>`;
                });
            } else if (typeof sections === 'object') {
                Object.entries(sections).forEach(([key, value]) => {
                    // Extract description or content safely
                    let sectionText = '';
                    if (typeof value === 'string') {
                        sectionText = value;
                    } else if (typeof value === 'object') {
                        sectionText = value.description || value.Description || value.content || JSON.stringify(value);
                    }
                    sectionsText += `<li><strong>${key}:</strong> ${sectionText}</li>`;
                });
            }
            
            sectionsText += '</ul>';
        }
        
        if (!summaryText || summaryText.length < 200) {
            // If summary is too short, note that it's inadequate
            if (summaryText) {
                summaryText += " (Note: This summary is minimal and should be expanded with a more comprehensive analysis of at least 200 words that fully explains the bill's purpose, provisions, and implications.)";
            } else {
                summaryText = "No adequate summary available. A comprehensive summary of at least 200 words should be provided that fully explains the bill's purpose, provisions, and implications.";
            }
        }
        
        // Combine summary text with sections
        const fullSummaryHtml = `<p>${summaryText}</p>${sectionsText}`;
        htmlContent += createSection('Bill Summary', fullSummaryHtml);

        // Financial Implications
        let financialImplications = safeGet(data, 'financialImplications');
        if (typeof financialImplications === 'object') {
            financialImplications = 'The financial implications are not properly specified. Further analysis is needed.';
        }
        
        htmlContent += createSection('Financial Implications', `
            <p>${financialImplications}</p>
        `);

        // Ideological Leaning
        let ideologicalLeaning = safeGet(data, 'ideologicalLeaning');
        if (typeof ideologicalLeaning === 'object') {
            ideologicalLeaning = 'The ideological leaning is not properly specified. Further analysis is needed.';
        }
        
        htmlContent += createSection('Ideological Leaning', `
            <p>${ideologicalLeaning}</p>
        `);

        // Advocacy Group Positions
        let advocacyGroupPositions = safeGet(data, 'advocacyGroupPositions');
        if (typeof advocacyGroupPositions === 'object') {
            advocacyGroupPositions = 'The advocacy group positions are not properly specified. Further analysis is needed.';
        }
        
        htmlContent += createSection('Advocacy Group Positions', `
            <p>${advocacyGroupPositions}</p>
        `);

        // Changes to Existing Law
        let changesTo = safeGet(data, 'changesTo');
        if (typeof changesTo === 'object') {
            changesTo = 'The changes to existing law are not properly specified. Further analysis is needed.';
        }
        
        htmlContent += createSection('Changes to Existing Law', `
            <p>${changesTo}</p>
        `);

        // Similar Laws
        let similarLaws = safeGet(data, 'similarLaws');
        if (typeof similarLaws === 'object') {
            similarLaws = 'The similar laws in other states are not properly specified. Further analysis is needed.';
        }
        
        htmlContent += createSection('Similar Laws in Other States', `
            <p>${similarLaws}</p>
        `);

        // Other Factors
        let otherFactors = safeGet(data, 'otherFactors');
        if (typeof otherFactors === 'object') {
            otherFactors = 'Other factors to consider are not properly specified. Further analysis is needed.';
        }
        
        htmlContent += createSection('Other Factors to Consider', `
            <p>${otherFactors}</p>
        `);

        // Citations
        if (data.citations && Array.isArray(data.citations) && data.citations.length > 0) {
            let citationsHtml = '<ul>';
            data.citations.forEach(citation => {
                citationsHtml += `<li>${citation}</li>`;
            });
            citationsHtml += '</ul>';
            htmlContent += createSection('Citations', citationsHtml);
        }

        // Set the HTML content
        summaryContent.innerHTML = htmlContent;
    }

    // Function to display bill search results - using same patterns as summary
    function displayBillSearch(data) {
        // Clear previous content
        if (!searchContent) {
            console.error('Search content element not found');
            return;
        }
        
        searchContent.innerHTML = '';
        
        // Log the data structure to help with debugging
        console.log('Displaying bill search results with data:', JSON.stringify(data, null, 2));
        
        // Create HTML content for the search results
        let htmlContent = '';

        // If no bill found
        if (data.error) {
            htmlContent = `<div class="bill-section"><p>${data.error}</p></div>`;
            searchContent.innerHTML = htmlContent;
            return;
        }

        // Use the same pattern from the summary function for all sections
        // Basic bill information
        const billNumber = safeGet(data, ['billNumber', 'bill_number', 'BillNumber', 'Bill Number']);
        const billName = safeGet(data, ['billName', 'bill_name', 'BillName', 'Bill Name']);
        const state = safeGet(data, ['state', 'State']);
        const yearIntroduced = safeGet(data, ['yearIntroduced', 'year_introduced', 'YearIntroduced', 'Year Introduced']);

        htmlContent += createSection('Bill Information', `
            <p><strong>Bill Number:</strong> ${billNumber}</p>
            <p><strong>Bill Name:</strong> ${billName}</p>
            <p><strong>State:</strong> ${state}</p>
            <p><strong>Year Introduced:</strong> ${yearIntroduced}</p>
        `);

        // Sponsors and Committee
        const sponsors = safeGet(data, ['sponsors', 'bill_sponsors', 'BillSponsor', 'Bill Sponsor', 'Bill Sponsor(s)']);
        const cosponsors = safeGet(data, ['cosponsors', 'bill_cosponsors', 'BillCosponsors', 'Bill Cosponsors', 'Bill Cosponsor(s)']);
        const committee = safeGet(data, ['committee', 'committee_referred_to', 'CommitteeReferredTo', 'Committee Referred To']);

        htmlContent += createSection('Sponsors & Committee', `
            <p><strong>Sponsor(s):</strong> ${formatList(sponsors)}</p>
            <p><strong>Co-sponsor(s):</strong> ${formatList(cosponsors)}</p>
            <p><strong>Committee Referred to:</strong> ${committee}</p>
        `);

        // Bill Summary
        let summaryText = '';
        
        // Try to extract summary from different possible structures
        if (data.summary) {
            if (typeof data.summary === 'string') {
                summaryText = data.summary;
            } else if (typeof data.summary === 'object') {
                if (data.summary.description) {
                    summaryText = data.summary.description;
                } else if (data.summary.Purpose) {
                    summaryText = data.summary.Purpose;
                }
            }
        } else if (data.Summary) {
            if (typeof data.Summary === 'string') {
                summaryText = data.Summary;
            } else if (typeof data.Summary === 'object') {
                if (data.Summary.Purpose) {
                    summaryText = data.Summary.Purpose;
                } else if (data.Summary.description) {
                    summaryText = data.Summary.description;
                }
            }
        }
        
        // Add bill sections to the summary if available
        let sectionsText = '';
        let sectionsFound = false;
        
        // Try different section formats
        const sections = data.sections || data.summary?.sections || data.Summary?.sections || data.Summary?.Sections;
        
        if (sections) {
            sectionsFound = true;
            sectionsText += '<p><strong>Bill Sections:</strong></p><ul>';
            
            if (Array.isArray(sections)) {
                sections.forEach((section, index) => {
                    const sectionTitle = section.title || section.number || `Section ${index + 1}`;
                    const sectionContent = section.content || section.description || section.Description || 
                                          (typeof section === 'string' ? section : JSON.stringify(section));
                    sectionsText += `<li><strong>${sectionTitle}:</strong> ${sectionContent}</li>`;
                });
            } else if (typeof sections === 'object') {
                Object.entries(sections).forEach(([key, value]) => {
                    // Extract description or content safely
                    let sectionText = '';
                    if (typeof value === 'string') {
                        sectionText = value;
                    } else if (typeof value === 'object') {
                        sectionText = value.description || value.Description || value.content || JSON.stringify(value);
                    }
                    sectionsText += `<li><strong>${key}:</strong> ${sectionText}</li>`;
                });
            }
            
            sectionsText += '</ul>';
        }
        
        if (!summaryText || summaryText.length < 200) {
            // If summary is too short, note that it's inadequate
            if (summaryText) {
                summaryText += " (Note: This summary is minimal and should be expanded with a more comprehensive analysis of at least 200 words that fully explains the bill's purpose, provisions, and implications.)";
            } else {
                summaryText = "No adequate summary available. A comprehensive summary of at least 200 words should be provided that fully explains the bill's purpose, provisions, and implications.";
            }
        }
        
        // Combine summary text with sections
        const fullSummaryHtml = `<p>${summaryText}</p>${sectionsText}`;
        htmlContent += createSection('Bill Summary', fullSummaryHtml);
        
        // Handle all the other sections the same way as in the summary function
        // Financial Implications
        let financialImplications = safeGet(data, 'financialImplications');
        if (typeof financialImplications === 'object') {
            financialImplications = 'The financial implications are not properly specified. Further analysis is needed.';
        }
        
        htmlContent += createSection('Financial Implications', `
            <p>${financialImplications}</p>
        `);

        // Ideological Leaning
        let ideologicalLeaning = safeGet(data, 'ideologicalLeaning');
        if (typeof ideologicalLeaning === 'object') {
            ideologicalLeaning = 'The ideological leaning is not properly specified. Further analysis is needed.';
        }
        
        htmlContent += createSection('Ideological Leaning', `
            <p>${ideologicalLeaning}</p>
        `);

        // Advocacy Group Positions
        let advocacyGroupPositions = safeGet(data, 'advocacyGroupPositions');
        if (typeof advocacyGroupPositions === 'object') {
            advocacyGroupPositions = 'The advocacy group positions are not properly specified. Further analysis is needed.';
        }
        
        htmlContent += createSection('Advocacy Group Positions', `
            <p>${advocacyGroupPositions}</p>
        `);

        // Changes to Existing Law
        let changesTo = safeGet(data, 'changesTo');
        if (typeof changesTo === 'object') {
            changesTo = 'The changes to existing law are not properly specified. Further analysis is needed.';
        }
        
        htmlContent += createSection('Changes to Existing Law', `
            <p>${changesTo}</p>
        `);

        // Similar Laws
        let similarLaws = safeGet(data, 'similarLaws');
        if (typeof similarLaws === 'object') {
            similarLaws = 'The similar laws in other states are not properly specified. Further analysis is needed.';
        }
        
        htmlContent += createSection('Similar Laws in Other States', `
            <p>${similarLaws}</p>
        `);

        // Other Factors
        let otherFactors = safeGet(data, 'otherFactors');
        if (typeof otherFactors === 'object') {
            otherFactors = 'Other factors to consider are not properly specified. Further analysis is needed.';
        }
        
        htmlContent += createSection('Other Factors to Consider', `
            <p>${otherFactors}</p>
        `);

        // Citations
        if (data.citations && Array.isArray(data.citations) && data.citations.length > 0) {
            let citationsHtml = '<ul>';
            data.citations.forEach(citation => {
                citationsHtml += `<li>${citation}</li>`;
            });
            citationsHtml += '</ul>';
            htmlContent += createSection('Citations', citationsHtml);
        }

        // Set the HTML content
        searchContent.innerHTML = htmlContent;
    }

    // Helper function to create a section of the results
    function createSection(title, content) {
        return `
            <div class="bill-section">
                <h3>${title}</h3>
                ${content}
            </div>
        `;
    }
});