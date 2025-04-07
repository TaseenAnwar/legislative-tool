document.addEventListener('DOMContentLoaded', function() {
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
        const summaryContent = document.getElementById('summary-content');

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
        const searchContent = document.getElementById('search-content');

        searcherForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            console.log('Searcher form submitted');
            
            const billName = document.getElementById('bill-name').value;
            const billNumber = document.getElementById('bill-number').value;
            const billState = document.getElementById('bill-state').value;
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

    // Function to display bill summary results
    function displayBillSummary(data) {
        // Clear previous content
        summaryContent.innerHTML = '';
        
        // Create HTML content for the summary
        let htmlContent = '';

        // Basic bill information
        htmlContent += createSection('Bill Information', `
            <p><strong>Bill Number:</strong> ${data.billNumber || 'Not specified'}</p>
            <p><strong>Bill Name:</strong> ${data.billName || 'Not specified'}</p>
            <p><strong>State:</strong> ${data.state || 'Not specified'}</p>
            <p><strong>Year Introduced:</strong> ${data.yearIntroduced || 'Not specified'}</p>
        `);

        // Sponsors and Committee
        htmlContent += createSection('Sponsors & Committee', `
            <p><strong>Sponsor(s):</strong> ${data.sponsors || 'Not specified'}</p>
            <p><strong>Co-sponsor(s):</strong> ${data.cosponsors || 'Not specified'}</p>
            <p><strong>Committee Referred to:</strong> ${data.committee || 'Not specified'}</p>
        `);

        // Bill Summary
        htmlContent += createSection('Bill Summary', `
            <p>${data.summary || 'No summary available'}</p>
        `);

        // Bill Sections (if applicable)
        if (data.sections && data.sections.length > 0) {
            let sectionsHtml = '<p><strong>Bill Sections:</strong></p><ul>';
            data.sections.forEach(section => {
                sectionsHtml += `<li><strong>${section.title}:</strong> ${section.content}</li>`;
            });
            sectionsHtml += '</ul>';
            htmlContent += createSection('Bill Sections', sectionsHtml);
        }

        // Financial Implications
        let financialHtml = `<p>${data.financialImplications || 'No financial implications specified'}</p>`;
        if (data.financialImplicationsAI) {
            financialHtml += `<p class="ai-note">${data.financialImplicationsAI} (AI)</p>`;
        }
        htmlContent += createSection('Financial Implications', financialHtml);

        // Ideological Leaning
        let ideologicalHtml = `<p>${data.ideologicalLeaning || 'No ideological leaning specified'}</p>`;
        if (data.ideologicalLeaningAI) {
            ideologicalHtml += `<p class="ai-note">${data.ideologicalLeaningAI} (AI)</p>`;
        }
        htmlContent += createSection('Ideological Leaning', ideologicalHtml);

        // Advocacy Group Positions
        let advocacyHtml = `<p>${data.advocacyGroupPositions || 'No advocacy group positions specified'}</p>`;
        if (data.advocacyGroupPositionsAI) {
            advocacyHtml += `<p class="ai-note">${data.advocacyGroupPositionsAI} (AI)</p>`;
        }
        htmlContent += createSection('Advocacy Group Positions', advocacyHtml);

        // Changes to Existing Law
        let changesHtml = `<p>${data.changesTo || 'No changes to existing law specified'}</p>`;
        if (data.changesToAI) {
            changesHtml += `<p class="ai-note">${data.changesToAI} (AI)</p>`;
        }
        htmlContent += createSection('Changes to Existing Law', changesHtml);

        // Similar Laws
        let similarLawsHtml = `<p>${data.similarLaws || 'No similar laws specified'}</p>`;
        if (data.similarLawsAI) {
            similarLawsHtml += `<p class="ai-note">${data.similarLawsAI} (AI)</p>`;
        }
        htmlContent += createSection('Similar Laws in Other States', similarLawsHtml);

        // Other Factors
        let otherFactorsHtml = `<p>${data.otherFactors || 'No other factors specified'}</p>`;
        if (data.otherFactorsAI) {
            otherFactorsHtml += `<p class="ai-note">${data.otherFactorsAI} (AI)</p>`;
        }
        htmlContent += createSection('Other Factors to Consider', otherFactorsHtml);

        // Citations
        if (data.citations && data.citations.length > 0) {
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

    // Function to display bill search results
    function displayBillSearch(data) {
        // Clear previous content
        searchContent.innerHTML = '';
        
        // Create HTML content for the search results - using the same format as the summary
        let htmlContent = '';

        // If no bill found
        if (data.error) {
            htmlContent = `<div class="bill-section"><p>${data.error}</p></div>`;
            searchContent.innerHTML = htmlContent;
            return;
        }

        // Basic bill information
        htmlContent += createSection('Bill Information', `
            <p><strong>Bill Number:</strong> ${data.billNumber || 'Not specified'}</p>
            <p><strong>Bill Name:</strong> ${data.billName || 'Not specified'}</p>
            <p><strong>State:</strong> ${data.state || 'Not specified'}</p>
            <p><strong>Year Introduced:</strong> ${data.yearIntroduced || 'Not specified'}</p>
        `);

        // Sponsors and Committee
        htmlContent += createSection('Sponsors & Committee', `
            <p><strong>Sponsor(s):</strong> ${data.sponsors || 'Not specified'}</p>
            <p><strong>Co-sponsor(s):</strong> ${data.cosponsors || 'Not specified'}</p>
            <p><strong>Committee Referred to:</strong> ${data.committee || 'Not specified'}</p>
        `);

        // Bill Summary
        htmlContent += createSection('Bill Summary', `
            <p>${data.summary || 'No summary available'}</p>
        `);

        // Bill Sections (if applicable)
        if (data.sections && data.sections.length > 0) {
            let sectionsHtml = '<p><strong>Bill Sections:</strong></p><ul>';
            data.sections.forEach(section => {
                sectionsHtml += `<li><strong>${section.title}:</strong> ${section.content}</li>`;
            });
            sectionsHtml += '</ul>';
            htmlContent += createSection('Bill Sections', sectionsHtml);
        }

        // Financial Implications
        htmlContent += createSection('Financial Implications', `
            <p>${data.financialImplications || 'No financial implications specified'}</p>
        `);

        // Ideological Leaning
        htmlContent += createSection('Ideological Leaning', `
            <p>${data.ideologicalLeaning || 'No ideological leaning specified'}</p>
        `);

        // Advocacy Group Positions
        htmlContent += createSection('Advocacy Group Positions', `
            <p>${data.advocacyGroupPositions || 'No advocacy group positions specified'}</p>
        `);

        // Changes to Existing Law
        htmlContent += createSection('Changes to Existing Law', `
            <p>${data.changesTo || 'No changes to existing law specified'}</p>
        `);

        // Similar Laws
        htmlContent += createSection('Similar Laws in Other States', `
            <p>${data.similarLaws || 'No similar laws specified'}</p>
        `);

        // Other Factors
        htmlContent += createSection('Other Factors to Consider', `
            <p>${data.otherFactors || 'No other factors specified'}</p>
        `);

        // Citations
        if (data.citations && data.citations.length > 0) {
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