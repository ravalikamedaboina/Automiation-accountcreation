const XLSX = require('xlsx');
const axios = require('axios');
require('dotenv').config();

class ExcelAPIProcessor {
    constructor() {
        // API configuration - set these in your .env file
        this.tokenApiUrl = process.env.TOKEN_API_URL || 'https://www.auth-qa.alaskaair.com/oauth2/default/v1/token';
        this.enrollmentApiUrl = process.env.ENROLLMENT_API_URL || 'https://apis.qa.alaskaair.com/enrollment/api/join-mileage-plan';
        this.accrualApiUrl = process.env.ACCRUAL_API_URL || 'https://apis.qa.alaskaair.com/mileageplan/api/accruals';
        this.tierApiUrl = process.env.TIER_API_URL || 'https://apis.qa.alaskaair.com/mileageplan/api/tier';
        this.basicAuthToken = process.env.BASIC_AUTH_TOKEN || '';
        this.subscriptionKey = process.env.OCP_APIM_SUBSCRIPTION_KEY || '';
        this.lmsOverride = process.env.LMS_OVERRIDE || 'LPS';
        
        // Accrual codes
        this.accrualCodes = {
            eqm: process.env.ACCRUAL_CODE_EQM || 'SSHA5',
            net: process.env.ACCRUAL_CODE_NET || 'SSHAN',
            millionMiles: process.env.ACCRUAL_CODE_MILLION_MILES || 'SSHAL',
            segments: process.env.ACCRUAL_CODE_SEGMENTS || 'SSHAS'
        };
        
        // Error mitigation configuration
        this.maxRetries = parseInt(process.env.MAX_RETRIES) || 3;
        this.retryDelay = parseInt(process.env.RETRY_DELAY) || 2000;
        this.requestTimeout = parseInt(process.env.REQUEST_TIMEOUT) || 30000;
        this.rateLimitDelay = parseInt(process.env.RATE_LIMIT_DELAY) || 1000;
        
        // Error tracking
        this.errorStats = {
            tokenErrors: 0,
            enrollmentErrors: 0,
            networkErrors: 0,
            timeoutErrors: 0,
            rateLimitErrors: 0,
            validationErrors: 0
        };
        
        // Track used external codes to ensure uniqueness within session
        this.usedExternalCodes = new Set();
    }

    /**
     * Read Excel file and return data as JSON
     * @param {string} filePath - Path to Excel file
     * @param {string} sheetName - Name of sheet to read (optional)
     * @returns {Array} Array of row objects
     */
    readExcelFile(filePath, sheetName = null) {
        try {
            console.log(`Reading Excel file: ${filePath}`);
            
            // Read the workbook
            const workbook = XLSX.readFile(filePath);
            
            // Get sheet name (use first sheet if not specified)
            const sheet = sheetName || workbook.SheetNames[0];
            console.log(`Reading sheet: ${sheet}`);
            
            // Convert sheet to JSON
            const worksheet = workbook.Sheets[sheet];
            const data = XLSX.utils.sheet_to_json(worksheet);
            
            console.log(`Successfully read ${data.length} rows from Excel file`);
            return data;
        } catch (error) {
            console.error('Error reading Excel file:', error.message);
            throw error;
        }
    }

    /**
     * Make token API call with retry logic and error mitigation
     * @param {Object} rowData - Data from Excel row (not used for client_credentials)
     * @returns {string} Access token
     */
    async getToken(rowData) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`🔐 Making token API call to Alaska Airlines OAuth... (Attempt ${attempt}/${this.maxRetries})`);
                
                // Prepare form data for client_credentials grant
                const tokenData = new URLSearchParams();
                tokenData.append('grant_type', 'client_credentials');
                tokenData.append('scope', 'mileageplan.lms');

                const response = await axios.post(this.tokenApiUrl, tokenData, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${this.basicAuthToken}`
                    },
                    timeout: this.requestTimeout
                });

                const token = response.data.access_token || response.data.token;
                console.log('✅ Token obtained successfully from Alaska Airlines OAuth');
                return token;
                
            } catch (error) {
                lastError = error;
                this.errorStats.tokenErrors++;
                
                const errorType = this.categorizeError(error);
                console.warn(`⚠️ Token API attempt ${attempt} failed: ${errorType}`);
                
                if (attempt < this.maxRetries && this.shouldRetry(error)) {
                    const delay = this.calculateRetryDelay(attempt, errorType);
                    console.log(`⏳ Retrying in ${delay}ms...`);
                    await this.sleep(delay);
                } else {
                    break;
                }
            }
        }
        
        console.error('❌ All token API attempts failed:', lastError.response?.data || lastError.message);
        throw lastError;
    }

    /**
     * Make enrollment API call with comprehensive error mitigation
     * @param {string} token - Access token from previous call
     * @param {Object} rowData - Data from Excel row
     * @returns {Object} Enrollment response
     */
    async makeEnrollmentCall(token, rowData) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`🎯 Making Alaska Airlines Mileage Plan enrollment API call... (Attempt ${attempt}/${this.maxRetries})`);
                
                // Validate required fields before making the call
                const validationResult = this.validateEnrollmentData(rowData);
                if (!validationResult.isValid) {
                    console.warn('⚠️ Data validation failed:', validationResult.errors);
                    this.errorStats.validationErrors++;
                    // Continue with call but log warnings
                }
                
                // Prepare enrollment payload using Excel data - matching Alaska Airlines API format
                const enrollmentPayload = this.buildEnrollmentPayload(rowData);
                
                console.log('📤 Enrollment payload prepared:', {
                    firstName: enrollmentPayload.firstName,
                    lastName: enrollmentPayload.lastName,
                    email: enrollmentPayload.emailAddress,
                    username: enrollmentPayload.username
                });

                const response = await axios.post(this.enrollmentApiUrl, enrollmentPayload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'lmsOverride': this.lmsOverride,
                        'Ocp-Apim-Subscription-Key': this.subscriptionKey
                    },
                    timeout: this.requestTimeout
                });

                console.log('🎉 Alaska Airlines Mileage Plan enrollment call SUCCESSFUL!');
                
                // Log the full ORIGINAL successful response
                console.log('=== ORIGINAL SUCCESSFUL API RESPONSE ===');
                console.log('Response Status:', response.status);
                console.log('Response Headers:', JSON.stringify(response.headers, null, 2));
                console.log('ORIGINAL Response Data:', JSON.stringify(response.data, null, 2));
                console.log('Available Response Fields:', Object.keys(response.data));
                console.log('=== END ORIGINAL SUCCESSFUL RESPONSE ===');
                
                return this.extractMileagePlanNumber(response.data);
                
            } catch (error) {
                lastError = error;
                this.errorStats.enrollmentErrors++;
                
                const errorType = this.categorizeError(error);
                const errorDetails = this.extractErrorDetails(error);
                
                console.log('=== ORIGINAL API ERROR RESPONSE ===');
                console.log(`Error Type: ${errorType}`);
                console.log('Error Status:', error.response?.status);
                console.log('Error Headers:', JSON.stringify(error.response?.headers, null, 2));
                console.log('Error Data (Original):', JSON.stringify(error.response?.data, null, 2));
                console.log('Available Error Fields:', error.response?.data ? Object.keys(error.response.data) : 'No data');
                
                // Check for partial success or hidden data in error response
                const hiddenSuccess = this.checkForHiddenSuccess(error.response?.data);
                if (hiddenSuccess) {
                    console.log('🎯 FOUND PARTIAL SUCCESS IN ERROR RESPONSE');
                    return hiddenSuccess;
                }
                
                console.log('=== END ORIGINAL ERROR RESPONSE ===');
                
                console.warn(`⚠️ Enrollment attempt ${attempt} failed: ${errorType} - ${errorDetails.message}`);
                
                // Don't retry on certain error types
                if (!this.shouldRetry(error) || attempt === this.maxRetries) {
                    break;
                }
                
                const delay = this.calculateRetryDelay(attempt, errorType);
                console.log(`⏳ Retrying enrollment in ${delay}ms...`);
                await this.sleep(delay);
            }
        }
        
        console.error('❌ All enrollment attempts failed:', lastError.response?.data || lastError.message);
        throw lastError;
    }

    /**
     * Process Excel file and make API calls for each row
     * @param {string} excelFilePath - Path to Excel file
     * @param {string} sheetName - Sheet name (optional)
     */
    async processExcelFile(excelFilePath, sheetName = null) {
        try {
            console.log('Starting Excel processing...');
            
            // Read Excel data
            const excelData = this.readExcelFile(excelFilePath, sheetName);
            
            const results = [];
            
            // Process each row
            for (let i = 0; i < excelData.length; i++) {
                const rowData = excelData[i];
                console.log(`\nProcessing row ${i + 1}/${excelData.length}`);
                
                try {
                    // Get token using current row data
                    const token = await this.getToken(rowData);
                    
                    // Make enrollment call using token and row data
                    const enrollmentResult = await this.makeEnrollmentCall(token, rowData);
                    
                    console.log(`Row ${i + 1} enrollment successful - Mileage Plan #: ${enrollmentResult.mileagePlanNumber}`);
                    
                    // Process accruals and tier if values are present
                    const accrualResults = await this.processAccrualsAndTier(token, enrollmentResult.mileagePlanNumber, rowData);
                    
                    results.push({
                        row: i + 1,
                        success: true,
                        status: 'success',
                        data: rowData,
                        userName: rowData.username || rowData.Username || rowData.user_name,
                        firstName: rowData.firstName || rowData.FirstName || rowData.first_name,
                        lastName: rowData.lastName || rowData.LastName || rowData.last_name,
                        email: rowData.emailAddress || rowData.EmailAddress || rowData.email_address || rowData.Email,
                        mileagePlanNumber: enrollmentResult.mileagePlanNumber,
                        response: enrollmentResult,
                        enrollmentData: enrollmentResult,
                        accrualResults: accrualResults.accruals,
                        tierResult: accrualResults.tier,
                        processingTime: new Date().toISOString()
                    });
                    
                    console.log(`✅ Row ${i + 1} fully processed - MP#: ${enrollmentResult.mileagePlanNumber}`);
                    
                } catch (error) {
                    console.error(`Error processing row ${i + 1}:`, error.message);
                    results.push({
                        row: i + 1,
                        success: false,
                        status: 'error',
                        data: rowData,
                        userName: rowData.username || rowData.Username || rowData.user_name,
                        firstName: rowData.firstName || rowData.FirstName || rowData.first_name,
                        lastName: rowData.lastName || rowData.LastName || rowData.last_name,
                        email: rowData.emailAddress || rowData.EmailAddress || rowData.email_address || rowData.Email,
                        error: error.message,
                        errorDetails: error.response?.data || null,
                        mileagePlanNumber: null,
                        processingTime: new Date().toISOString()
                    });
                }
                
                // Add delay between requests to avoid rate limiting
                if (i < excelData.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            console.log('\n✅ Processing complete!');
            console.log(`Successful: ${results.filter(r => r.status === 'success').length}`);
            console.log(`Failed: ${results.filter(r => r.status === 'error').length}`);
            
            // Print error statistics
            this.printErrorStats();
            
            return results;
            
        } catch (error) {
            console.error('Error processing Excel file:', error.message);
            throw error;
        }
    }

    /**
     * Save results as CSV file with Mileage Plan numbers
     * @param {Array} results - Processing results array
     */
    saveResultsAsCSV(results) {
        try {
            const fs = require('fs');
            
            // CSV headers
            const csvHeaders = [
                'Row',
                'Status',
                'Username',
                'First Name',
                'Last Name', 
                'Email',
                'Mileage Plan Number',
                'Error Message'
            ];
            
            // Convert results to CSV rows
            const csvRows = results.map(result => [
                result.row,
                result.status,
                result.userName || '',
                result.firstName || '',
                result.lastName || '',
                result.email || '',
                result.mileagePlanNumber || '',
                result.error || ''
            ]);
            
            // Combine headers with data
            const csvContent = [csvHeaders, ...csvRows]
                .map(row => row.map(field => `"${field}"`).join(','))
                .join('\n');
            
            // Write CSV file
            fs.writeFileSync('./results.csv', csvContent);
            
            console.log('CSV file created with enrollment results and Mileage Plan numbers');
            
        } catch (error) {
            console.error('Error saving CSV file:', error.message);
        }
    }

    /**
     * Error mitigation helper methods
     */
    
    validateEnrollmentData(rowData) {
        const errors = [];
        const required = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'phoneNumber', 'emailAddress', 'addressLine1', 'city', 'stateProvinceTerritory', 'zipPostalCode', 'username', 'password'];
        
        for (const field of required) {
            const value = rowData[field] || rowData[field.charAt(0).toUpperCase() + field.slice(1)] || rowData[field.toLowerCase()];
            if (!value || value.toString().trim() === '') {
                errors.push(`Missing required field: ${field}`);
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
    
    buildEnrollmentPayload(rowData) {
        return {
            firstName: rowData.firstName || rowData.FirstName || rowData.first_name,
            lastName: rowData.lastName || rowData.LastName || rowData.last_name,
            middleName: rowData.middleName || rowData.MiddleName || rowData.middle_name || "",
            suffix: rowData.suffix || rowData.Suffix || "",
            dateOfBirth: rowData.dateOfBirth || rowData.DateOfBirth || rowData.date_of_birth,
            gender: rowData.gender || rowData.Gender || "M",
            countryCode: rowData.countryCode || rowData.CountryCode || rowData.country_code || "1",
            phoneNumber: rowData.phoneNumber || rowData.PhoneNumber || rowData.phone_number,
            emailAddress: rowData.emailAddress || rowData.EmailAddress || rowData.email_address || rowData.Email,
            countryRegion: rowData.countryRegion || rowData.CountryRegion || rowData.country_region || "US",
            addressLine1: rowData.addressLine1 || rowData.AddressLine1 || rowData.address_line1,
            addressLine2: rowData.addressLine2 || rowData.AddressLine2 || rowData.address_line2 || "",
            city: rowData.city || rowData.City,
            stateProvinceTerritory: rowData.stateProvinceTerritory || rowData.StateProvinceTerritory || rowData.state_province_territory || rowData.State,
            zipPostalCode: rowData.zipPostalCode || rowData.ZipPostalCode || rowData.zip_postal_code || rowData.ZipCode,
            primaryDepartureCity: rowData.primaryDepartureCity || rowData.PrimaryDepartureCity || rowData.primary_departure_city || "SEA",
            username: rowData.username || rowData.Username || rowData.user_name,
            password: rowData.password || rowData.Password
        };
    }
    
    extractMileagePlanNumber(responseData) {
        // Alaska Airlines typical response fields for Mileage Plan number
        const mileagePlanNumber = responseData.mileagePlanNumber || 
                                responseData.memberNumber || 
                                responseData.accountNumber ||
                                responseData.memberId ||
                                responseData.customerId ||
                                responseData.ffNumber ||
                                responseData.frequentFlyerNumber ||
                                responseData.loyaltyNumber ||
                                responseData.id ||
                                responseData.number ||
                                responseData.membershipNumber ||
                                responseData.enrollmentId ||
                                // Check nested objects
                                responseData.member?.number ||
                                responseData.member?.id ||
                                responseData.member?.mileagePlanNumber ||
                                responseData.enrollment?.memberNumber ||
                                responseData.enrollment?.id ||
                                responseData.result?.memberNumber ||
                                responseData.result?.id ||
                                // Check if it's in a nested structure
                                (responseData.data && responseData.data.memberNumber) ||
                                (responseData.data && responseData.data.id) ||
                                'NOT_FOUND_IN_RESPONSE';
        
        console.log(`🎯 Extracted Mileage Plan Number: ${mileagePlanNumber}`);
        
        return {
            ...responseData,
            mileagePlanNumber: mileagePlanNumber,
            extractedFrom: Object.keys(responseData)
        };
    }
    
    checkForHiddenSuccess(errorData) {
        if (!errorData) return null;
        
        // Look for any fields that might contain Mileage Plan numbers even in error responses
        const possibleMPNumber = errorData.mileagePlanNumber || 
                                errorData.memberNumber || 
                                errorData.memberId ||
                                errorData.id ||
                                errorData.enrollmentId ||
                                (errorData.data && errorData.data.memberNumber) ||
                                (errorData.result && errorData.result.memberNumber);
        
        if (possibleMPNumber && possibleMPNumber !== 'NOT_FOUND_IN_RESPONSE') {
            console.log(`🎯 FOUND MILEAGE PLAN NUMBER IN ERROR RESPONSE: ${possibleMPNumber}`);
            
            return {
                ...errorData,
                mileagePlanNumber: possibleMPNumber,
                extractedFrom: 'error_response',
                originalError: true
            };
        }
        
        return null;
    }
    
    categorizeError(error) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            this.errorStats.timeoutErrors++;
            return 'TIMEOUT';
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            this.errorStats.networkErrors++;
            return 'NETWORK';
        } else if (error.response?.status === 429) {
            this.errorStats.rateLimitErrors++;
            return 'RATE_LIMIT';
        } else if (error.response?.status >= 400 && error.response?.status < 500) {
            return 'CLIENT_ERROR';
        } else if (error.response?.status >= 500) {
            return 'SERVER_ERROR';
        } else {
            return 'UNKNOWN';
        }
    }
    
    extractErrorDetails(error) {
        return {
            status: error.response?.status,
            message: error.response?.data?.message || error.message,
            requestId: error.response?.data?.requestId,
            traceId: error.response?.data?.traceId,
            correlationId: error.response?.headers?.['x-correlation-id']
        };
    }
    
    shouldRetry(error) {
        const errorType = this.categorizeError(error);
        
        // Don't retry on client errors (400-499) - these are data/validation issues
        if (errorType === 'CLIENT_ERROR') {
            console.log('❌ Client error - no retry (data/validation issue)');
            return false;
        }
        
        // Don't retry on authentication errors
        if (error.response?.status === 401 || error.response?.status === 403) {
            console.log('❌ Authentication error - no retry');
            return false;
        }
        
        // Don't retry on specific errors that won't change
        if (error.response?.status === 422) {
            console.log('❌ Unprocessable Entity (422) - no retry (username exists, validation failed)');
            return false;
        }
        
        // Retry on server errors, timeouts, network issues, and rate limits
        const shouldRetry = ['SERVER_ERROR', 'TIMEOUT', 'NETWORK', 'RATE_LIMIT'].includes(errorType);
        if (shouldRetry) {
            console.log(`✅ ${errorType} - will retry`);
        }
        return shouldRetry;
    }
    
    calculateRetryDelay(attempt, errorType) {
        let baseDelay = this.retryDelay;
        
        // Exponential backoff
        const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
        
        // Special handling for rate limits - longer delay
        if (errorType === 'RATE_LIMIT') {
            return exponentialDelay * 2;
        }
        
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 1000;
        return exponentialDelay + jitter;
    }
    
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Generate a guaranteed unique external code for accrual transactions
     */
    async generateUniqueExternalCode(mileagePlanNumber, accrualCode) {
        let externalCode;
        let attempts = 0;
        const maxAttempts = 10;
        
        do {
            // Use format similar to your example: 13707668_SShp
            const timestamp = Date.now().toString().slice(-8); // Last 8 digits of timestamp
            const randomSuffix = Math.random().toString(36).substring(2, 4); // 2-character random
            
            externalCode = `${timestamp}_SS${randomSuffix}`;
            attempts++;
            
            // Add small delay if we need to retry to ensure different timestamp
            if (this.usedExternalCodes.has(externalCode) && attempts < maxAttempts) {
                await this.sleep(2); // Slightly longer delay to ensure timestamp difference
            }
            
        } while (this.usedExternalCodes.has(externalCode) && attempts < maxAttempts);
        
        if (attempts >= maxAttempts) {
            // Fallback with UUID-like suffix if somehow we can't generate unique code
            const fallbackSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
            externalCode = `${Date.now().toString().slice(-8)}_SS${fallbackSuffix}`;
        }
        
        // Track this code as used
        this.usedExternalCodes.add(externalCode);
        
        console.log(`🔑 Generated unique external code: ${externalCode} (attempt ${attempts})`);
        return externalCode;
    }
    
    /**
     * Process accruals and tier updates for a member after successful enrollment
     */
    async processAccrualsAndTier(token, mileagePlanNumber, rowData) {
        const results = {
            accruals: [],
            tier: null
        };
        
        console.log(`🎯 Processing accruals and tier for MP#: ${mileagePlanNumber}`);
        
        // Process accruals if values are present
        const accrualTypes = [
            { field: 'Net', code: this.accrualCodes.net },
            { field: 'EQM', code: this.accrualCodes.eqm },
            { field: 'Segments', code: this.accrualCodes.segments },
            { field: 'MillionMiles', code: this.accrualCodes.millionMiles }
        ];
        
        for (const accrualType of accrualTypes) {
            const value = rowData[accrualType.field] || rowData[accrualType.field.toLowerCase()];
            if (value && value.toString().trim() !== '') {
                console.log(`💰 Processing ${accrualType.field} accrual: ${value} (code: ${accrualType.code})`);
                try {
                    const accrualResult = await this.makeAccrualCall(token, mileagePlanNumber, accrualType.code, value);
                    results.accruals.push({
                        type: accrualType.field,
                        code: accrualType.code,
                        value: value,
                        result: accrualResult,
                        status: 'success'
                    });
                    console.log(`✅ ${accrualType.field} accrual successful`);
                } catch (error) {
                    console.log(`❌ ${accrualType.field} accrual failed:`, error.message);
                    results.accruals.push({
                        type: accrualType.field,
                        code: accrualType.code,
                        value: value,
                        error: error.message,
                        status: 'error'
                    });
                }
            }
        }
        
        // Process tier update if value is present (TierActiveFrom is mandatory)
        const tierValue = rowData.Tier || rowData.tier;
        const tierActiveFrom = rowData.TierActiveFrom || rowData.tierActiveFrom || rowData.tier_active_from;
        
        if (tierValue && tierValue.toString().trim() !== '') {
            if (tierActiveFrom && tierActiveFrom.toString().trim() !== '') {
                console.log(`👑 Processing tier update: ${tierValue} (active from: ${tierActiveFrom})`);
                try {
                    const tierResult = await this.makeTierCall(token, mileagePlanNumber, tierValue, tierActiveFrom);
                    results.tier = {
                        value: tierValue,
                        activeFrom: tierActiveFrom,
                        result: tierResult,
                        status: 'success'
                    };
                    console.log(`✅ Tier update successful`);
                } catch (error) {
                    console.log(`❌ Tier update failed:`, error.message);
                    results.tier = {
                        value: tierValue,
                        activeFrom: tierActiveFrom,
                        error: error.message,
                        status: 'error'
                    };
                }
            } else {
                console.log(`⚠️ Tier value present (${tierValue}) but TierActiveFrom is missing - skipping tier update`);
                results.tier = {
                    value: tierValue,
                    activeFrom: null,
                    error: 'TierActiveFrom is required but missing',
                    status: 'skipped'
                };
            }
        }
        
        return results;
    }
    
    /**
     * Make accrual API call using Alaska Airlines LPS format
     */
    async makeAccrualCall(token, mileagePlanNumber, accrualCode, value) {
        // Generate guaranteed unique external code for this transaction
        const externalCode = await this.generateUniqueExternalCode(mileagePlanNumber, accrualCode);
        
        const payload = {
            membershipReference: {
                id: mileagePlanNumber,
                type: "MP"
            },
            eventSubType: "AIR",
            externalCode: externalCode,
            partner: "SS",
            accrualCode: accrualCode,
            value: value.toString(),
            actionType: "CREDIT"
        };
        
        console.log(`📤 Accrual payload (${accrualCode}):`, JSON.stringify(payload, null, 2));
        
        const response = await axios.post(this.accrualApiUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Ocp-Apim-Subscription-Key': this.subscriptionKey
            },
            timeout: this.requestTimeout
        });
        
        console.log(`📥 Accrual response (${accrualCode}):`, JSON.stringify(response.data, null, 2));
        return response.data;
    }
    
    /**
     * Make tier API call using Alaska Airlines LPS format with activeFrom field
     */
    async makeTierCall(token, mileagePlanNumber, tierValue, activeFrom) {
        // Map tier values to Alaska Airlines tier levels
        const tierMapping = {
            'MVP': 'TIER_1',
            'MVP_GOLD': 'TIER_2', 
            'MVP_GOLD_75K': 'TIER_3',
            'MVP_GOLD_100K': 'TIER_4',
            // Add more mappings as needed
            'TIER_1': 'TIER_1',
            'TIER_2': 'TIER_2',
            'TIER_3': 'TIER_3',
            'TIER_4': 'TIER_4'
        };
        
        const mappedTierLevel = tierMapping[tierValue.toUpperCase()] || tierValue;
        
        const payload = {
            membershipReference: {
                id: parseInt(mileagePlanNumber),
                type: "MP"
            },
            tierLevel: mappedTierLevel,
            tierLevelReason: "NOMINATION",
            activeFrom: activeFrom
        };
        
        console.log(`📤 Tier payload (${tierValue} -> ${mappedTierLevel}, active from: ${activeFrom}):`, JSON.stringify(payload, null, 2));
        
        const response = await axios.post(this.tierApiUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Ocp-Apim-Subscription-Key': this.subscriptionKey
            },
            timeout: this.requestTimeout
        });
        
        console.log(`📥 Tier response (${tierValue}):`, JSON.stringify(response.data, null, 2));
        return response.data;
    }

    printErrorStats() {
        console.log('\n📊 ERROR STATISTICS:');
        console.log('='.repeat(50));
        console.log(`Token Errors: ${this.errorStats.tokenErrors}`);
        console.log(`Enrollment Errors: ${this.errorStats.enrollmentErrors}`);
        console.log(`Network Errors: ${this.errorStats.networkErrors}`);
        console.log(`Timeout Errors: ${this.errorStats.timeoutErrors}`);
        console.log(`Rate Limit Errors: ${this.errorStats.rateLimitErrors}`);
        console.log(`Validation Errors: ${this.errorStats.validationErrors}`);
    }
}

// Main execution
async function main() {
    try {
        const processor = new ExcelAPIProcessor();
        
        // Update this path to your Excel file
        const excelFilePath = './data/sample-template.xlsx';
        
        // Process the Excel file
        const results = await processor.processExcelFile(excelFilePath);
        
        // Generate simple detailed reports
        const SimpleReportGenerator = require('./SimpleReportGenerator');
        const reportGenerator = new SimpleReportGenerator();
        const reportFiles = reportGenerator.generateSimpleReport(results);
        
        // Save results to files (legacy format)
        const fs = require('fs');
        
        // Save detailed JSON results
        fs.writeFileSync('./results.json', JSON.stringify(results, null, 2));
        console.log('Detailed results saved to results.json');
        
        // Save CSV summary with Mileage Plan numbers
        processor.saveResultsAsCSV(results);
        console.log('Summary results saved to results.csv');
        
    } catch (error) {
        console.error('Application error:', error.message);
        process.exit(1);
    }
}

// Run the application
if (require.main === module) {
    main();
}

module.exports = ExcelAPIProcessor;