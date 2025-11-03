const fs = require('fs');
const path = require('path');

class SimpleReportGenerator {
    constructor() {
        this.reportDir = './data';
        this.ensureReportDirectory();
    }

    ensureReportDirectory() {
        if (!fs.existsSync(this.reportDir)) {
            fs.mkdirSync(this.reportDir, { recursive: true });
        }
    }

    generateSimpleReport(results) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Generate simple detailed report
        const report = {
            reportTitle: "Alaska Airlines Processing Results",
            generatedOn: reportDate,
            totalRows: results.length,
            results: results.map((result, index) => this.formatSimpleResult(result, index + 1))
        };

        // Save simple JSON report
        const jsonReportPath = path.join(this.reportDir, `processing-results-${timestamp}.json`);
        fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2));

        // Generate simple CSV
        const csvReport = this.generateSimpleCSV(results);
        const csvReportPath = path.join(this.reportDir, `processing-results-${timestamp}.csv`);
        fs.writeFileSync(csvReportPath, csvReport);

        // Display console summary
        this.displayConsoleSummary(results);

        console.log('\n📁 REPORTS SAVED TO DATA FOLDER:');
        console.log(`📄 JSON: ${jsonReportPath}`);
        console.log(`📊 CSV: ${csvReportPath}`);

        return {
            jsonReport: jsonReportPath,
            csvReport: csvReportPath
        };
    }

    formatSimpleResult(result, rowNumber) {
        const formatted = {
            row: rowNumber,
            firstName: result.data?.FirstName || result.firstName || 'Unknown',
            lastName: result.data?.LastName || result.lastName || 'Unknown',
            email: result.data?.Email || result.email || 'Unknown',
            enrollment: {
                status: result.success ? 'SUCCESS' : 'FAILED',
                mileagePlanNumber: result.mileagePlanNumber || 'N/A',
                error: result.success ? null : (result.error || 'Unknown error')
            }
        };

        // Add accruals if present
        if (result.accrualResults && result.accrualResults.length > 0) {
            formatted.accruals = {};
            result.accrualResults.forEach(accrual => {
                formatted.accruals[accrual.type] = {
                    value: accrual.value,
                    status: accrual.status === 'success' ? 'SUCCESS' : 'FAILED',
                    error: accrual.status === 'success' ? null : (accrual.error || 'Unknown error')
                };
            });
        }

        // Add tier if present
        if (result.tierResult) {
            formatted.tier = {
                value: result.tierResult.value,
                activeFrom: result.tierResult.activeFrom,
                status: result.tierResult.status === 'success' ? 'SUCCESS' : 'FAILED',
                error: result.tierResult.status === 'success' ? null : (result.tierResult.error || 'Unknown error'),
                tierLevel: result.tierResult.result?.response?.tierLevelValue || null
            };
        }

        return formatted;
    }

    generateSimpleCSV(results) {
        const headers = [
            'Row',
            'FirstName',
            'LastName',
            'Email',
            'Enrollment_Status',
            'MP_Number',
            'Net_Status',
            'Net_Value',
            'EQM_Status', 
            'EQM_Value',
            'Segments_Status',
            'Segments_Value',
            'MillionMiles_Status',
            'MillionMiles_Value',
            'Tier_Status',
            'Tier_Value',
            'Tier_Level',
            'Errors'
        ];

        const rows = results.map((result, index) => {
            const accruals = result.accrualResults || [];
            const errors = [];

            if (!result.success) errors.push(result.error || 'Enrollment failed');
            accruals.forEach(a => {
                if (a.status !== 'success') errors.push(`${a.type}: ${a.error || 'Failed'}`);
            });
            if (result.tierResult && result.tierResult.status !== 'success') {
                errors.push(`Tier: ${result.tierResult.error || 'Failed'}`);
            }

            return [
                index + 1,
                result.data?.FirstName || result.firstName || '',
                result.data?.LastName || result.lastName || '',
                result.data?.Email || result.email || '',
                result.success ? 'SUCCESS' : 'FAILED',
                result.mileagePlanNumber || '',
                this.getAccrualStatus(accruals, 'Net'),
                this.getAccrualValue(accruals, 'Net'),
                this.getAccrualStatus(accruals, 'EQM'),
                this.getAccrualValue(accruals, 'EQM'),
                this.getAccrualStatus(accruals, 'Segments'),
                this.getAccrualValue(accruals, 'Segments'),
                this.getAccrualStatus(accruals, 'MillionMiles'),
                this.getAccrualValue(accruals, 'MillionMiles'),
                result.tierResult?.status === 'success' ? 'SUCCESS' : (result.tierResult ? 'FAILED' : ''),
                result.tierResult?.value || '',
                result.tierResult?.result?.response?.tierLevelValue || '',
                errors.join('; ')
            ];
        });

        return [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    }

    getAccrualStatus(accruals, type) {
        const accrual = accruals.find(a => a.type === type);
        return accrual ? (accrual.status === 'success' ? 'SUCCESS' : 'FAILED') : '';
    }

    getAccrualValue(accruals, type) {
        const accrual = accruals.find(a => a.type === type);
        return accrual ? accrual.value : '';
    }

    displayConsoleSummary(results) {
        console.log('\n🎯 PROCESSING RESULTS SUMMARY');
        console.log('='.repeat(50));
        
        let enrollmentSuccess = 0;
        let accrualSuccess = 0;
        let accrualTotal = 0;
        let tierSuccess = 0;
        let tierTotal = 0;

        results.forEach((result, index) => {
            console.log(`\n📋 Row ${index + 1}: ${result.data?.FirstName || result.firstName} ${result.data?.LastName || result.lastName}`);
            
            // Enrollment status
            if (result.success) {
                enrollmentSuccess++;
                console.log(`   ✅ Enrollment: SUCCESS (MP#: ${result.mileagePlanNumber})`);
            } else {
                console.log(`   ❌ Enrollment: FAILED (${result.error || 'Unknown error'})`);
            }

            // Accruals status
            if (result.accrualResults && result.accrualResults.length > 0) {
                console.log(`   💰 Accruals:`);
                result.accrualResults.forEach(accrual => {
                    accrualTotal++;
                    if (accrual.status === 'success') {
                        accrualSuccess++;
                        console.log(`      ✅ ${accrual.type}: ${accrual.value} (SUCCESS)`);
                    } else {
                        console.log(`      ❌ ${accrual.type}: ${accrual.value} (FAILED - ${accrual.error || 'Unknown'})`);
                    }
                });
            }

            // Tier status
            if (result.tierResult) {
                tierTotal++;
                if (result.tierResult.status === 'success') {
                    tierSuccess++;
                    console.log(`   👑 Tier: ✅ ${result.tierResult.value} → ${result.tierResult.result?.response?.tierLevelValue || 'Updated'} (SUCCESS)`);
                } else {
                    console.log(`   👑 Tier: ❌ ${result.tierResult.value} (FAILED - ${result.tierResult.error || 'Unknown'})`);
                }
            }
        });

        console.log('\n📊 OVERALL STATISTICS:');
        console.log('-'.repeat(30));
        console.log(`📝 Total Rows: ${results.length}`);
        console.log(`✅ Enrollment Success: ${enrollmentSuccess}/${results.length}`);
        if (accrualTotal > 0) {
            console.log(`💰 Accrual Success: ${accrualSuccess}/${accrualTotal}`);
        }
        if (tierTotal > 0) {
            console.log(`👑 Tier Success: ${tierSuccess}/${tierTotal}`);
        }
    }
}

module.exports = SimpleReportGenerator;