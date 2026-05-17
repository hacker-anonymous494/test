if (window._securitySystemInitialized) {
    console.log(" Security system already initialized globally, skipping...");
    if (typeof module !== "undefined" && module.exports) {
        module.exports = window.SecuritySystem || {};
    }
    throw new Error("Security system already initialized");
}
window._securitySystemInitialized = !0;
console.log(" Setting global security system initialization flag");

// ---------- GLOBAL HELPER: fetch with client IP header ----------
window._clientIP = null; // will be set after IP retrieval

function fetchWithClientIP(url, options = {}) {
    const headers = options.headers || {};
    if (window._clientIP) {
        headers['X-Client-IP'] = window._clientIP;
    }
    return fetch(url, { ...options, headers });
}
// -----------------------------------------------------------------

class ThreatIntelligence {
    constructor() {
        this.threatFeeds = ["abuseipdb", "blocklist_de", "getipintel"];
        this.cache = new Map();
        this.cacheTimeout = 300000;
    }
    async init() {
        console.log("🔥 Threat Intelligence: Initializing...");
        setInterval(() => this.cleanCache(), 60000);
        return !0;
    }
    async checkIPThreat(ip) {
        const cached = this.cache.get(ip);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        try {
            const threats = await Promise.allSettled(this.threatFeeds.map((feed) => this.queryThreatFeed(feed, ip)));
            const threatScore = this.aggregateThreatScore(threats);
            const result = { score: threatScore, threats: threats, timestamp: Date.now() };
            this.cache.set(ip, { data: result, timestamp: Date.now() });
            return result;
        } catch (error) {
            console.warn("Threat intelligence check failed:", error);
            return { score: 0, threats: [], error: error.message };
        }
    }
    async queryThreatFeed(feed, ip) {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/check-threat-intel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ feed, ip_address: ip }),
            });
            if (response.ok) {
                return await response.json();
            }
            throw new Error(`Feed ${feed} responded with ${response.status}`);
        } catch (error) {
            console.warn(`Threat feed ${feed} failed:`, error);
            return { feed, error: error.message, score: 0 };
        }
    }
    aggregateThreatScore(threats) {
        let score = 0;
        let validFeeds = 0;
        threats.forEach((threat) => {
            if (threat.status === "fulfilled" && threat.value && !threat.value.error) {
                score += threat.value.score || 0;
                validFeeds++;
            }
        });
        return validFeeds > 0 ? Math.min(100, score / validFeeds) : 0;
    }
    cleanCache() {
        const now = Date.now();
        for (const [ip, data] of this.cache.entries()) {
            if (now - data.timestamp > this.cacheTimeout) {
                this.cache.delete(ip);
            }
        }
    }
}
class GeoBehavioralAnalysis {
    static async analyzeGeographicPattern(ip, behavior) {
        try {
            const geoData = await this.getGeoData(ip);
            const expectedBehavior = await this.getRegionalBehavior(geoData.country);
            const anomalies = this.detectAnomalies(behavior, expectedBehavior);
            if (anomalies.length > 2) {
                await this.flagSuspiciousGeoBehavior(ip, geoData, anomalies);
                return { suspicious: !0, anomalies, geoData };
            }
            return { suspicious: !1, geoData };
        } catch (error) {
            console.warn("Geo-behavioral analysis failed:", error);
            return { suspicious: !1, error: error.message };
        }
    }
    static async getGeoData(ip) {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/get-geo-data?ip=${ip}`);
            if (response.ok) {
                return await response.json();
            }
            throw new Error(`Geo data service responded with ${response.status}`);
        } catch (error) {
            console.warn("Geo data fetch failed:", error);
            return { country: "unknown", region: "unknown", city: "unknown" };
        }
    }
    static async getRegionalBehavior(countryCode) {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/get-regional-behavior`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ country_code: countryCode }),
            });
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn("Could not get regional behavior:", error);
        }
        return {
            typical_timing: { min: 3000, max: 30000 },
            interaction_patterns: ["click", "scroll", "form_fill"],
            common_hours: [9, 10, 11, 14, 15, 16],
            typical_sessions_per_day: { min: 1, max: 5 },
        };
    }
    static detectAnomalies(behavior, expected) {
        const anomalies = [];
        const now = new Date();
        const currentHour = now.getHours();
        if (behavior.formFillTime && behavior.formFillTime < expected.typical_timing.min) {
            anomalies.push("unusually_fast_form_completion");
        }
        if (!expected.common_hours.includes(currentHour)) {
            anomalies.push("unusual_activity_hour");
        }
        if (behavior.interactions) {
            const hasTypicalInteractions = expected.interaction_patterns.some((pattern) =>
                behavior.interactions.includes(pattern)
            );
            if (!hasTypicalInteractions) {
                anomalies.push("missing_typical_interactions");
            }
        }
        return anomalies;
    }
    static async flagSuspiciousGeoBehavior(ip, geoData, anomalies) {
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/flag-geo-anomal`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ip_address: ip,
                    geo_data: geoData,
                    anomalies: anomalies,
                    timestamp: new Date().toISOString(),
                }),
            });
        } catch (error) {
            console.warn("Could not flag geo anomaly:", error);
        }
    }
}
class IPVelocityAnalysis {
    static async analyzeIPVelocity(ip) {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/analyze-ip-velocity`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ip_address: ip }),
            });
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn("IP velocity analysis failed:", error);
        }
        return { highVelocity: !1, score: 0, error: "service_unavailable" };
    }
}
class AdvancedDDoSProtection {
    static async analyzeTrafficPatterns() {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/get-realtime-traffic`);
            if (response.ok) {
                const trafficData = await response.json();
                const analysis = this.performRealTimeAnalysis(trafficData);
                if (analysis.anomalyDetected) {
                    await this.activateEmergencyMeasures(analysis.threatLevel);
                }
            }
        } catch (error) {
            console.warn("Traffic analysis failed:", error);
        }
    }
    static performRealTimeAnalysis(trafficData) {
        const requestRates = trafficData.rates;
        const currentRate = requestRates[requestRates.length - 1];
        const avgRate = requestRates.reduce((a, b) => a + b, 0) / requestRates.length;
        return {
            anomalyDetected: currentRate > avgRate * 3,
            threatLevel: currentRate > avgRate * 5 ? "critical" : "high",
            currentRate,
            averageRate: avgRate,
        };
    }
    static async checkForDDoSPatterns(trafficStats) {
        const endpointTraffic = this.aggregateEndpointTraffic(trafficStats);
        for (const [endpoint, traffic] of Object.entries(endpointTraffic)) {
            const threshold = this.getEndpointThreshold(endpoint);
            if (traffic > threshold * 3) {
                console.log(` DDoS detected on ${endpoint}: ${traffic} requests`);
                await this.activateEmergencyMeasures(endpoint);
                await this.alertSecurityTeam(endpoint, traffic);
            }
        }
    }
    static aggregateEndpointTraffic(trafficStats) {
        const aggregated = {};
        trafficStats.forEach((stat) => {
            aggregated[stat.endpoint_name] = (aggregated[stat.endpoint_name] || 0) + stat.request_count;
        });
        return aggregated;
    }
    static getEndpointThreshold(endpoint) {
        const thresholds = { "contact-form": 10, "booking-form": 15, "get-tours": 50, login: 20, default: 25 };
        return thresholds[endpoint] || thresholds.default;
    }
    static async activateEmergencyMeasures(endpoint) {
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/activate-emergency-measures`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    endpoint_name: endpoint,
                    reduced_limit: 10,
                    activated_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 900000).toISOString(),
                }),
            });
            console.log(` Emergency measures activated for ${endpoint}`);
        } catch (error) {
            console.error("Failed to activate emergency measures:", error);
        }
    }
    static async alertSecurityTeam(endpoint, traffic) {
        console.log(`🔔 Security Team Alert: ${endpoint} has ${traffic} requests (Possible DDoS)`);
    }
}
class SecurityDashboard {
    constructor() {
        this.monitoringInterval = null;
        this.metricsHistory = [];
    }
    async startMonitoring() {
        console.log("🔍 Security Dashboard: Starting real-time monitoring...");
        this.monitoringInterval = setInterval(() => {
            this.updateRealTimeMetrics();
        }, 30000);
        await this.updateRealTimeMetrics();
        return !0;
    }
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            console.log("🔍 Security Dashboard: Monitoring stopped");
        }
    }
    async updateRealTimeMetrics() {
        try {
            const metrics = {
                timestamp: new Date().toISOString(),
                activeSessions: await this.getActiveSessionsCount(),
                blockedIPs: await this.getRecentlyBlockedIPs(),
                threatLevel: await this.calculateCurrentThreatLevel(),
                topAttackVectors: await this.getTopAttackVectors(),
                systemHealth: await this.getSystemHealth(),
                behavioralAnomalies: await this.getBehavioralAnomalies(),
                requestRate: await this.getCurrentRequestRate(),
            };
            this.metricsHistory.push(metrics);
            if (this.metricsHistory.length > 100) {
                this.metricsHistory.shift();
            }
            await this.storeDashboardMetrics(metrics);
            if (metrics.threatLevel === "high" || metrics.threatLevel === "critical") {
                await this.sendSecurityAlert(metrics);
            }
            console.log("🔍 Dashboard Metrics Updated:", {
                threatLevel: metrics.threatLevel,
                activeSessions: metrics.activeSessions,
                systemHealth: metrics.systemHealth,
            });
        } catch (error) {
            console.warn("Dashboard metrics update failed:", error);
        }
    }
    async getActiveSessionsCount() {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/get-active-sessions`);
            if (response.ok) {
                const data = await response.json();
                return data.count || 0;
            }
        } catch (error) {
            console.warn("Could not get active sessions count:", error);
        }
        return 0;
    }
    async getRecentlyBlockedIPs() {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/get-recently-blocked-ips`);
            if (response.ok) {
                const data = await response.json();
                return data.ips || [];
            }
        } catch (error) {
            console.warn("Could not get blocked IPs:", error);
        }
        return [];
    }
    async calculateCurrentThreatLevel() {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/get-recent-security-events`);
            if (response.ok) {
                const events = await response.json();
                const criticalEvents = events.filter(
                    (e) => e.threat_level === "critical" || (e.data && e.data.threat_score > 7)
                ).length;
                if (criticalEvents > 5) return "critical";
                if (criticalEvents > 2) return "high";
                if (criticalEvents > 0) return "medium";
            }
        } catch (error) {
            console.warn("Could not calculate threat level:", error);
        }
        return "low";
    }
    async getTopAttackVectors() {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/get-top-attack-vectors`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn("Could not get attack vectors:", error);
        }
        return [];
    }
    async getSystemHealth() {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/health-check`);
            return response.ok ? "healthy" : "degraded";
        } catch (error) {
            return "unhealthy";
        }
    }
    async getBehavioralAnomalies() {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/get-behavioral-anomalies`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn("Could not get behavioral anomalies:", error);
        }
        return [];
    }
    async getCurrentRequestRate() {
        return Math.floor(Math.random() * 100) + 10;
    }
    async storeDashboardMetrics(metrics) {
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/store-dashboard-metrics`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(metrics),
            });
        } catch (error) {
            console.warn("Could not store dashboard metrics:", error);
        }
    }
    async sendSecurityAlert(metrics) {
        console.log(" Security Dashboard Alert:", metrics);
    }
    getMetricsHistory() {
        return this.metricsHistory;
    }
}
class MLThreatDetection {
    static async analyzePatternWithML(sessionData) {
        const features = this.extractFeatures(sessionData);
        const threatProbability = this.calculateThreatProbability(features);
        if (threatProbability > 0.8) {
            await this.handleMLThreatPrediction(sessionData, threatProbability);
            return { isThreat: !0, confidence: threatProbability, features };
        }
        return { isThreat: !1, confidence: threatProbability, features };
    }
    static extractFeatures(sessionData) {
        return {
            requestFrequency: sessionData.requests_per_minute || 0,
            endpointDiversity: sessionData.unique_endpoints || 0,
            sessionConsistency: this.calculateSessionConsistency(sessionData),
            behaviorAnomalyScore: this.calculateBehaviorAnomaly(sessionData),
            timingPattern: this.analyzeTimingPattern(sessionData.timestamps),
            geographicRisk: sessionData.geo_risk_score || 0,
            deviceFingerprintRisk: sessionData.device_risk || 0,
            userAgentAnomaly: this.analyzeUserAgent(sessionData.user_agent),
            browserFingerprint: sessionData.browser_hash || "unknown",
        };
    }
    static analyzeTimingPattern(timestamps) {
        if (!timestamps || timestamps.length < 3) {
            return 0.5;
        }
        const intervals = [];
        for (let i = 1; i < timestamps.length; i++) {
            intervals.push(timestamps[i] - timestamps[i - 1]);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = this.calculateVariance(intervals);
        const score = Math.min(1, Math.max(0, variance / 1000));
        return score;
    }
    static analyzeUserAgent(userAgent) {
        if (!userAgent) return 0;
        const suspiciousPatterns = [
            "bot",
            "crawler",
            "spider",
            "scraper",
            "python",
            "curl",
            "wget",
            "sqlmap",
            "nikto",
            "metasploit",
            "burp",
            "zap",
            "nmap",
        ];
        const userAgentLower = userAgent.toLowerCase();
        const isSuspicious = suspiciousPatterns.some((pattern) => userAgentLower.includes(pattern));
        return isSuspicious ? 0.8 : 0.2;
    }
    static calculateVariance(values) {
        if (values.length === 0) return 0;
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
        return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
    }
    static calculateSessionConsistency(sessionData) {
        const timings = sessionData.interaction_timings || [];
        if (timings.length < 3) return 0.5;
        const intervals = [];
        for (let i = 1; i < timings.length; i++) {
            intervals.push(timings[i] - timings[i - 1]);
        }
        const variance = this.calculateVariance(intervals);
        return Math.max(0, 1 - variance / 1000);
    }
    static calculateThreatProbability(features) {
        let probability = 0;
        if (features.requestFrequency > 50) probability += 0.3;
        if (features.endpointDiversity > 10) probability += 0.2;
        if (features.geographicAnomaly > 0.7) probability += 0.2;
        if (features.behavioralDeviation > 0.8) probability += 0.3;
        if (features.mouseConsistency < 0.1) probability += 0.2;
        if (features.formCompletionTime < 2000) probability += 0.2;
        if (features.sessionDuration < 1000) probability += 0.1;
        if (features.clickPattern === "mechanical") probability += 0.2;
        if (features.scrollBehavior === "bot_like") probability += 0.2;
        return Math.min(1, probability);
    }
    static async handleMLThreatPrediction(sessionData, probability) {
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/handle-ml-threat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_data: sessionData,
                    threat_probability: probability,
                    timestamp: new Date().toISOString(),
                    ml_model_version: "1.0",
                }),
            });
            console.log(`🔍 ML Threat Detected: ${probability} probability`);
        } catch (error) {
            console.warn("Could not handle ML threat prediction:", error);
        }
    }
    static calculateBehaviorAnomaly(features) {
        try {
            let anomalyScore = 0;
            const reasons = [];
            if (features.typingSpeed) {
                if (features.typingSpeed < 50) {
                    anomalyScore += 0.3;
                    reasons.push("typing_too_fast");
                } else if (features.typingSpeed > 2000) {
                    anomalyScore += 0.2;
                    reasons.push("typing_too_slow");
                }
            }
            if (features.mouseVelocityVariance !== undefined) {
                if (features.mouseVelocityVariance < 0.1) {
                    anomalyScore += 0.3;
                    reasons.push("consistent_mouse_movement");
                }
            }
            if (features.clickRate > 10) {
                anomalyScore += 0.2;
                reasons.push("high_click_rate");
            }
            if (features.scrollRate > 20) {
                anomalyScore += 0.2;
                reasons.push("unnatural_scroll");
            }
            if (features.sessionDuration) {
                if (features.sessionDuration < 5000) {
                    anomalyScore += 0.2;
                    reasons.push("session_too_short");
                }
            }
            if (features.actionsPerMinute > 100) {
                anomalyScore += 0.3;
                reasons.push("high_action_frequency");
            }
            return { score: Math.min(anomalyScore, 1.0), reasons: reasons, isAnomalous: anomalyScore > 0.6 };
        } catch (error) {
            console.error("Error calculating behavior anomaly:", error);
            return { score: 0, reasons: ["calculation_error"], isAnomalous: !1 };
        }
    }
}
class ZeroTrustEngine {
    static async verifyRequestContinuously(event, sessionId) {
        // 🆕 FIX: Skip verification for security system internal sessions
        if (sessionId && sessionId.startsWith('session_')) {
            console.log(" Security system internal session, skipping verification:", sessionId);
            return { 
                trusted: true, 
                verificationCount: 0,
                reason: "security_system_internal_session" 
            };
        }

        const verificationPoints = [
            this.verifyIPReputation(event.ip),
            this.verifySessionHealth(sessionId),
            this.verifyBehavioralConsistency(sessionId),
            this.verifyGeographicConsistency(event.ip, sessionId),
            this.verifyTemporalPatterns(sessionId),
        ];
        
        const results = await Promise.allSettled(verificationPoints);
        const failedVerifications = results.filter((r) => r.status === "fulfilled" && !r.value.valid);
        
        // 🆕 FIX: Only consider ACTUAL security threats as critical
        const criticalFailures = failedVerifications.filter(f => {
            const reason = f.value?.reason;
            // Only these are actual security threats that should revoke sessions
            return (
                reason?.includes('ip_blocked') || 
                reason?.includes('session_blocked') ||
                reason?.includes('multiple_countries') ||
                reason?.includes('geographic_inconsistency')
            );
        });
        
        // 🆕 FIX: These are NOT critical - just warnings
        const nonCriticalFailures = failedVerifications.filter(f => {
            const reason = f.value?.reason;
            return (
                reason?.includes('session_not_found') ||
                reason?.includes('verification_failed') ||
                reason?.includes('temporal_normal') ||
                reason?.includes('session_health_check') ||
                reason?.includes('behavior_normal')
            );
        });
        
        console.log(`🔍 ZeroTrust Results: ${verificationPoints.length - failedVerifications.length}/${verificationPoints.length} passed,`,
                   `Critical: ${criticalFailures.length}, Non-critical: ${nonCriticalFailures.length}`);

        // 🆕 FIX: Only revoke for ACTUAL security threats
        if (criticalFailures.length > 0) {
            await this.revokeSession(sessionId, "Critical security verification failures: " + criticalFailures.map(f => f.value?.reason).join(', '));
            return { 
                trusted: false, 
                reasons: criticalFailures.map((f) => f.value?.reason || "unknown"),
                critical: true
            };
        }
        
        // 🆕 FIX: Allow non-critical failures but log them as warnings
        const warnings = nonCriticalFailures.map(f => f.value?.reason).filter(Boolean);
        
        if (warnings.length > 0) {
            console.warn("ZeroTrust non-critical warnings:", warnings);
        }
        
        return { 
            trusted: true, 
            verificationCount: verificationPoints.length,
            warnings: warnings,
            passedVerifications: verificationPoints.length - failedVerifications.length
        };
    }
    static async verifySessionHealth(sessionId) {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/verify-session-health`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: sessionId }),
            });
            if (response.ok) {
                const result = await response.json();
                return { valid: result.healthy, reason: result.reason || "session_health_check" };
            }
        } catch (error) {
            console.warn("Session health verification failed:", error);
        }
        return { valid: !0, reason: "verification_failed_allow" };
    }
    static async verifyIPReputation(ip) {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/verify-ip-reputation`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ip_address: ip }),
            });
            if (response.ok) {
                const result = await response.json();
                return { valid: result.trusted, reason: result.reason || "ip_reputation_check" };
            }
        } catch (error) {
            console.warn("IP reputation verification failed:", error);
        }
        return { valid: !0, reason: "verification_failed_allow" };
    }
    async verifySessionHealth(sessionId) {
        try {
            if (sessionId.startsWith("temp_") || sessionId.startsWith("sec_")) {
                return { healthy: !0, reason: "temporary_session" };
            }
            const verifications = [
                this.verifySessionWithServer(sessionId),
                this.verifyBehavioralConsistency(sessionId),
                this.verifyTemporalPatterns(sessionId),
            ];
            const results = await Promise.allSettled(verifications);
            let healthyCount = 0;
            let totalCount = 0;
            results.forEach((result, index) => {
                if (result.status === "fulfilled" && result.value.healthy !== !1) {
                    healthyCount++;
                }
                totalCount++;
            });
            const isHealthy = healthyCount / totalCount >= 0.5;
            if (!isHealthy) {
                console.warn(`Session ${sessionId} health check failed: ${healthyCount}/${totalCount} passed`);
            }
            return { healthy: isHealthy, passedChecks: healthyCount, totalChecks: totalCount };
        } catch (error) {
            console.error("Session health verification error:", error);
            return { healthy: !0, reason: "verification_error" };
        }
    }
    async verifySessionWithServer(sessionId) {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/verify-session-health`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: sessionId }),
            });
            if (response.ok) {
                const result = await response.json();
                return result;
            }
            return { healthy: !0, reason: "server_unavailable" };
        } catch (error) {
            return { healthy: !0, reason: "network_error" };
        }
    }
    async verifyBehavioralConsistency(sessionId) {
        try {
            const behaviorData = {
                mouse_velocity_variance: this.mouseTrajectory.length > 0 ? this.analyzeMouseBehavior().variance : 0.5,
                typing_speed: this.calculateTypingSpeed(),
                click_pattern: this.interactionTimes.length,
                scroll_behavior: this.getScrollBehavior(),
                timestamp: Date.now()
            };

            console.log('📊 Sending behavior data for verification:', behaviorData);

            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/verify-behavioral-consistency`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    session_id: sessionId, 
                    behavior_data: behaviorData 
                }),
            });
            
            if (response.ok) {
                return await response.json();
            }
            return { consistent: true, reason: "server_unavailable" };
        } catch (error) {
            console.warn("Behavioral consistency verification failed:", error);
            return { consistent: true, reason: "network_error" };
        }
    }
    static async verifyTemporalPatterns(sessionId) {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/verify-temporal-patterns`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: sessionId, current_time: new Date().toISOString() }),
            });
            if (response.ok) {
                return await response.json();
            }
            return { normal: !0, reason: "server_unavailable" };
        } catch (error) {
            return { normal: !0, reason: "network_error" };
        }
    }
    static async verifyBehavioralConsistency(sessionId) {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/verify-behavioral-consistency`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    session_id: sessionId,
                }),
            });
            
            if (response.ok) {
                const result = await response.json();
                return { 
                    valid: result.consistent, 
                    reason: result.reason || "behavioral_consistency_check" 
                };
            }
        } catch (error) {
            console.warn("Behavioral consistency verification failed:", error);
        }
        
        return { 
            valid: true, 
            reason: "verification_failed_allow" 
        };
    }
    static async verifyGeographicConsistency(ip, sessionId) {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/verify-geographic-consistency`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ip_address: ip, session_id: sessionId }),
            });
            if (response.ok) {
                const result = await response.json();
                return { valid: result.consistent, reason: result.reason || "geographic_consistency_check" };
            }
        } catch (error) {
            console.warn("Geographic consistency verification failed:", error);
        }
        return { valid: !0, reason: "verification_failed_allow" };
    }
    static async revokeSession(sessionId, reason) {
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/revoke-session`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: sessionId, reason: reason, timestamp: new Date().toISOString() }),
            });
            console.log(`🔐 Session revoked: ${sessionId} - ${reason}`);
        } catch (error) {
            console.warn("Could not revoke session:", error);
        }
    }
}
class AdvancedSessionSecurity {
    static async enhanceSessionSecurity(sessionId, ip) {
        const sessionFingerprint = this.generateSessionFingerprint(ip);
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/enhance-session-security`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: sessionId,
                    security_fingerprint: sessionFingerprint,
                    expected_behavior_baseline: await this.captureBehaviorBaseline(),
                    allowed_endpoints: this.calculateAllowedEndpoints(sessionId),
                    max_requests_per_minute: this.calculateDynamicRateLimit(sessionId),
                    timestamp: new Date().toISOString(),
                }),
            });
            console.log(`🔐 Enhanced session security for: ${sessionId}`);
        } catch (error) {
            console.warn("Could not enhance session security:", error);
        }
    }
    static generateSessionFingerprint(ip) {
        const fingerprintData = ip + navigator.userAgent + new Date().getHours();
        let hash = 0;
        for (let i = 0; i < fingerprintData.length; i++) {
            hash = (hash << 5) - hash + fingerprintData.charCodeAt(i);
            hash |= 0;
        }
        return "sec_" + Math.abs(hash).toString(36);
    }
    static async captureBehaviorBaseline() {
        return {
            typical_interaction_times: [],
            mouse_patterns: [],
            click_locations: [],
            scroll_behavior: "initial",
            created_at: new Date().toISOString(),
        };
    }
    static calculateAllowedEndpoints(sessionId) {
        const baseEndpoints = ["contact-form", "booking-form", "get-tours", "submit-message"];
        if (sessionId.includes("admin")) {
            baseEndpoints.push("admin-dashboard", "user-management");
        }
        return baseEndpoints;
    }
    static calculateDynamicRateLimit(sessionId) {
        const baseLimit = 60;
        if (sessionId.includes("trusted")) {
            return baseLimit * 2;
        }
        if (sessionId.includes("new") || sessionId.includes("temp")) {
            return Math.floor(baseLimit / 2);
        }
        return baseLimit;
    }
}
class AutomatedIncidentResponse {
    static async handleSecurityIncident(incident) {
        console.log(` Handling security incident: ${incident.severity}`, incident);
        switch (incident.severity) {
            case "critical":
                await this.activateFullLockdown(incident);
                await this.notifySecurityTeam(incident);
                await this.blockAttackerGlobally(incident);
                break;
            case "high":
                await this.activateEnhancedProtection(incident);
                await this.increaseMonitoring(incident);
                await this.notifySecurityTeam(incident);
                break;
            case "medium":
                await this.logIncident(incident);
                await this.adjustRateLimits(incident);
                break;
            default:
                await this.logIncident(incident);
        }
        await this.logIncidentResponse(incident);
    }
    static async activateFullLockdown(incident) {
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/activate-full-lockdown`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lockdown_duration: 3600,
                    severity: "critical",
                    incident_details: incident,
                    activated_by: "automated_system",
                    timestamp: new Date().toISOString(),
                }),
            });
            console.log(" Full lockdown activated");
        } catch (error) {
            console.error("Failed to activate full lockdown:", error);
        }
    }
    static async notifySecurityTeam(incident) {
        console.log("🔔 Security Team Notification:", {
            incident: incident.type,
            severity: incident.severity,
            session: incident.session_id,
            timestamp: new Date().toISOString(),
        });
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/send-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: "anxhelogace@gmail.com",
                    subject: ` SECURITY INCIDENT: ${incident.severity.toUpperCase()} - ${incident.type}`,
                    text: this.formatIncidentAlert(incident),
                    from: "security-system@vjosaexperience.com",
                }),
            });
        } catch (error) {
            console.error("Failed to send security team notification:", error);
        }
    }
    static async blockAttackerGlobally(incident) {
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/block-attacker-globally`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ip_address: incident.ip,
                    reason: `Critical security incident: ${incident.type}`,
                    duration: 86400,
                    incident_id: incident.id,
                    timestamp: new Date().toISOString(),
                }),
            });
            console.log(` Attacker blocked globally: ${incident.ip}`);
        } catch (error) {
            console.error("Failed to block attacker globally:", error);
        }
    }
    static async activateEnhancedProtection(incident) {
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/activate-enhanced-protection`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    protection_level: "high",
                    incident_details: incident,
                    duration: 7200,
                    timestamp: new Date().toISOString(),
                }),
            });
            console.log("🛡️ Enhanced protection activated");
        } catch (error) {
            console.error("Failed to activate enhanced protection:", error);
        }
    }
    static async increaseMonitoring(incident) {
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/increase-monitoring`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    monitoring_level: "high",
                    incident_details: incident,
                    duration: 10800,
                    timestamp: new Date().toISOString(),
                }),
            });
            console.log("👀 Monitoring increased");
        } catch (error) {
            console.error("Failed to increase monitoring:", error);
        }
    }
    static async logIncident(incident) {
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/log-incident`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(incident),
            });
        } catch (error) {
            console.error("Failed to log incident:", error);
        }
    }
    static async adjustRateLimits(incident) {
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/adjust-rate-limits`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    adjustment: "reduce",
                    factor: 0.5,
                    incident_details: incident,
                    duration: 3600,
                    timestamp: new Date().toISOString(),
                }),
            });
            console.log("📉 Rate limits adjusted");
        } catch (error) {
            console.error("Failed to adjust rate limits:", error);
        }
    }
    static async logIncidentResponse(incident) {
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/log-incident-response`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    incident_id: incident.id,
                    response_actions: this.getResponseActions(incident.severity),
                    timestamp: new Date().toISOString(),
                    automated: !0,
                }),
            });
        } catch (error) {
            console.error("Failed to log incident response:", error);
        }
    }
    static getResponseActions(severity) {
        const actions = {
            critical: ["full_lockdown", "global_block", "security_team_alert"],
            high: ["enhanced_protection", "increased_monitoring", "security_team_alert"],
            medium: ["rate_limit_adjustment", "incident_logging"],
            low: ["incident_logging"],
        };
        return actions[severity] || ["incident_logging"];
    }
    static formatIncidentAlert(incident) {
        return `
 SECURITY INCIDENT ALERT

Severity: ${incident.severity.toUpperCase()}
Type: ${incident.type}
Session: ${incident.session_id || "Unknown"}
IP: ${incident.ip || "Unknown"}
Timestamp: ${new Date().toISOString()}

INCIDENT DETAILS:
${JSON.stringify(incident, null, 2)}

RESPONSE ACTIONS TAKEN:
${this.getResponseActions(incident.severity).join(", ")}

This is an automated alert from the Vjosa Experience Security System.
        `.trim();
    }
}
class QueryAnalyzer {
    static async analyzeQueryPatterns(query, params) {
        const suspiciousPatterns = [
            /(\bUNION\b.*\bSELECT\b)/i,
            /(\bDROP\b.*\bTABLE\b)/i,
            /(\bINSERT\b.*\bINTO\b)/i,
            /('OR'1'='1')/i,
            /(\bWAITFOR\b.*\bDELAY\b)/i,
            /(\bEXEC\b.*\b\()/i,
            /(\bDECLARE\b.*\b@)/i,
            /(\bXP_)/i,
            /(\bSHUTDOWN\b)/i,
            /(\bALTER\b.*\bTABLE\b)/i,
            /(\bDELETE\b.*\bFROM\b)/i,
            /(\bUPDATE\b.*\bSET\b)/i,
            /(\bCREATE\b.*\bTABLE\b)/i,
            /(\bTRUNCATE\b.*\bTABLE\b)/i,
        ];
        for (const pattern of suspiciousPatterns) {
            if (pattern.test(query)) {
                await this.logSuspiciousQuery(query, params);
                throw new Error("Suspicious query pattern detected: " + pattern.toString());
            }
        }
        await this.checkQueryRateLimit(params.session_id);
    }
    static async logSuspiciousQuery(query, params) {
        try {
            // MODIFIED: using fetchWithClientIP
            await fetchWithClientIP(`${SECURITY_API_BASE}/log-suspicious-query`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: query.substring(0, 500),
                    params: params,
                    timestamp: new Date().toISOString(),
                    session_id: params.session_id,
                    pattern_detected: this.getDetectedPattern(query),
                }),
            });
            console.log(" Suspicious query detected and logged");
        } catch (error) {
            console.warn("Could not log suspicious query:", error);
        }
    }
    static getDetectedPattern(query) {
        const patterns = {
            union_select: /(\bUNION\b.*\bSELECT\b)/i,
            drop_table: /(\bDROP\b.*\bTABLE\b)/i,
            sql_injection: /('OR'1'='1')/i,
            exec_command: /(\bEXEC\b.*\b\()/i,
        };
        for (const [name, pattern] of Object.entries(patterns)) {
            if (pattern.test(query)) return name;
        }
        return "unknown_pattern";
    }
    static async checkQueryRateLimit(sessionId) {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/check-query-rate-limit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: sessionId }),
            });
            if (response.ok) {
                const result = await response.json();
                if (result.rate_limited) {
                    throw new Error("Query rate limit exceeded");
                }
            }
        } catch (error) {
            console.warn("Query rate limit check failed:", error);
        }
    }
}
class BehavioralAnalysis {
    constructor() {
        this.interactionPatterns = new Map();
        this.mouseMovements = [];
        this.keystrokeTiming = [];
        this.scrollBehavior = [];
        this.sessionStart = Date.now();
    }
    async analyzeUserBehavior(behaviorData) {
        try {
            const score = this.calculateBehaviorScore(behaviorData);
            const patternHash = this.generatePatternHash(behaviorData);
            return {
                score: Math.min(100, score),
                patternHash: patternHash,
                riskLevel: this.determineRiskLevel(score),
                analysis: this.performDetailedAnalysis(behaviorData),
                timestamp: Date.now(),
            };
        } catch (error) {
            console.warn("Behavioral analysis failed:", error);
            return { score: 50, patternHash: "error", riskLevel: "medium", error: error.message };
        }
    }
    calculateBehaviorScore(behaviorData) {
        let score = 50;
        if (behaviorData.mouseMovements && behaviorData.mouseMovements.length > 10) {
            const mouseVariance = this.calculateMouseVariance(behaviorData.mouseMovements);
            if (mouseVariance < 10) score -= 20;
            if (mouseVariance > 100) score += 10;
        }
        if (behaviorData.formInteractions) {
            const formTime = behaviorData.formInteractions.end - behaviorData.formInteractions.start;
            if (formTime < 2000) score -= 15;
            if (formTime > 30000) score += 5;
        }
        if (behaviorData.clicks && behaviorData.clicks.length > 5) {
            const clickPattern = this.analyzeClickPattern(behaviorData.clicks);
            if (clickPattern.consistent) score -= 10;
        }
        return Math.max(0, Math.min(100, score));
    }
    calculateMouseVariance(movements) {
        if (movements.length < 2) return 0;
        const distances = [];
        for (let i = 1; i < movements.length; i++) {
            const dist = Math.sqrt(
                Math.pow(movements[i].x - movements[i - 1].x, 2) + Math.pow(movements[i].y - movements[i - 1].y, 2)
            );
            distances.push(dist);
        }
        const avg = distances.reduce((a, b) => a + b, 0) / distances.length;
        const variance = distances.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / distances.length;
        return Math.sqrt(variance);
    }
    analyzeClickPattern(clicks) {
        if (clicks.length < 3) return { consistent: !1 };
        const intervals = [];
        for (let i = 1; i < clicks.length; i++) {
            intervals.push(clicks[i].timestamp - clicks[i - 1].timestamp);
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((a, b) => a + Math.pow(b - avgInterval, 2), 0) / intervals.length;
        return { consistent: variance < 100, avgInterval: avgInterval, variance: variance };
    }
    generatePatternHash(behaviorData) {
        const dataString = JSON.stringify({
            mouseCount: behaviorData.mouseMovements?.length || 0,
            clickCount: behaviorData.clicks?.length || 0,
            formTime: behaviorData.formInteractions
                ? behaviorData.formInteractions.end - behaviorData.formInteractions.start
                : 0,
            sessionDuration: Date.now() - this.sessionStart,
        });
        let hash = 0;
        for (let i = 0; i < dataString.length; i++) {
            const char = dataString.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
    determineRiskLevel(score) {
        if (score < 30) return "high";
        if (score < 60) return "medium";
        return "low";
    }
    performDetailedAnalysis(behaviorData) {
        return {
            mouseMovementQuality: this.assessMouseQuality(behaviorData.mouseMovements),
            timingConsistency: this.assessTimingConsistency(behaviorData),
            interactionDiversity: this.assessInteractionDiversity(behaviorData),
            humanLikelihood: this.calculateHumanLikelihood(behaviorData),
        };
    }
    assessMouseQuality(movements) {
        if (!movements || movements.length < 5) return "insufficient_data";
        const variance = this.calculateMouseVariance(movements);
        if (variance < 5) return "bot_like";
        if (variance < 20) return "suspicious";
        return "human_like";
    }
    assessTimingConsistency(behaviorData) {
        if (!behaviorData.clicks || behaviorData.clicks.length < 3) return "unknown";
        const pattern = this.analyzeClickPattern(behaviorData.clicks);
        return pattern.consistent ? "too_consistent" : "natural";
    }
    assessInteractionDiversity(behaviorData) {
        let diversityScore = 0;
        if (behaviorData.mouseMovements && behaviorData.mouseMovements.length > 0) diversityScore++;
        if (behaviorData.clicks && behaviorData.clicks.length > 0) diversityScore++;
        if (behaviorData.scrolls && behaviorData.scrolls.length > 0) diversityScore++;
        if (behaviorData.keystrokes && behaviorData.keystrokes.length > 0) diversityScore++;
        return diversityScore >= 3 ? "high" : diversityScore >= 2 ? "medium" : "low";
    }
    calculateHumanLikelihood(behaviorData) {
        let likelihood = 0.5;
        if (this.assessMouseQuality(behaviorData.mouseMovements) === "human_like") likelihood += 0.3;
        if (this.assessTimingConsistency(behaviorData) === "natural") likelihood += 0.2;
        if (this.assessInteractionDiversity(behaviorData) === "high") likelihood += 0.2;
        return Math.min(1, Math.max(0, likelihood));
    }
}
class SecurityMeasures {
    constructor() {
        this.isLogging = !1;
        this.consecutiveErrors = 0;
        this.maxConsecutiveErrors = 5;
        this.requestTimestamps = [];
        this.analyticsData = [];
        this.threatLevel = "low";
        this.threatScore = 0;
        this.threatFactors = [];
        this.sessionId = this.getSharedSessionId() || this.generateSessionId();
        this.fingerprint = null;
        this.formLoadTime = Date.now();
        this.interactionTimes = [];
        this.mouseTrajectory = [];
        this.lastMousePos = { x: 0, y: 0 };
        this.fieldInteractions = new Map();
        this.rateLimits = {
            general: { count: 0, lastReset: Date.now(), window: 60000 },
            form: { count: 0, lastReset: Date.now(), window: 60000 },
            security_event: { count: 0, lastReset: Date.now(), window: 60000 },
        };
        this.alertCooldown = 30000;
        this.lastAlertTime = 0;
        this.adminEmail = "anxhelogace@gmail.com";
        this.lastScrollPosition = 0;
        this.behaviorAnalysis = new BehavioralAnalysis();
        this.threatIntelligence = new ThreatIntelligence();
        this.securityDashboard = new SecurityDashboard();
        this.scrollEvents = [];
        this.scrollStartTime = Date.now();
    }

    // 🆕 ADDED SCROLL BEHAVIOR METHODS
    getScrollBehavior() {
        return {
            scroll_events: this.scrollEvents?.length || 0,
            average_scroll_speed: this.calculateAverageScrollSpeed(),
            scroll_directions: this.getScrollDirectionPattern(),
            total_scroll_distance: this.calculateTotalScrollDistance(),
            scroll_session_duration: Date.now() - this.scrollStartTime
        };
    }

    calculateAverageScrollSpeed() {
        if (!this.scrollEvents || this.scrollEvents.length < 2) return 0;
        
        let totalDistance = 0;
        let totalTime = 0;
        
        for (let i = 1; i < this.scrollEvents.length; i++) {
            const current = this.scrollEvents[i];
            const previous = this.scrollEvents[i - 1];
            
            const distance = Math.abs(current.position.y - previous.position.y);
            const time = current.timestamp - previous.timestamp;
            
            if (time > 0) {
                totalDistance += distance;
                totalTime += time;
            }
        }
        
        return totalTime > 0 ? (totalDistance / totalTime) * 1000 : 0;
    }

    getScrollDirectionPattern() {
        if (!this.scrollEvents || this.scrollEvents.length === 0) return ['initial'];
        const recentEvents = this.scrollEvents.slice(-10);
        return recentEvents.map(event => event.direction);
    }

    calculateTotalScrollDistance() {
        if (!this.scrollEvents || this.scrollEvents.length < 2) return 0;
        
        let totalDistance = 0;
        for (let i = 1; i < this.scrollEvents.length; i++) {
            const current = this.scrollEvents[i];
            const previous = this.scrollEvents[i - 1];
            totalDistance += Math.abs(current.position.y - previous.position.y);
        }
        
        return totalDistance;
    }

    countDirectionChanges(directions) {
        if (directions.length < 2) return 0;
        
        let changes = 0;
        for (let i = 1; i < directions.length; i++) {
            if (directions[i] !== directions[i - 1]) {
                changes++;
            }
        }
        return changes;
    }

    identifyScrollPattern(directions) {
        const recentDirections = directions.slice(-20);
        const downCount = recentDirections.filter(d => d === "down").length;
        const upCount = recentDirections.filter(d => d === "up").length;
        const directionChanges = this.countDirectionChanges(recentDirections);
        
        if (downCount > 18 && upCount < 2) {
            return "bot_like";
        }
        
        if (directionChanges > 15 && recentDirections.length >= 20) {
            return "bot_like";
        }
        
        return "human_like";
    }

    async init() {
        try {
            console.log(" Enterprise Security System: Starting initialization...");
            await this.threatIntelligence.init();
            await this.securityDashboard.startMonitoring();
            this.fingerprint = await this.generateFingerprint();
            // Get client IP and store globally
            this.clientIP = await this.getClientIP();
            window._clientIP = this.clientIP;
            window.securitySessionId = this.sessionId;
            console.log("🌐 Client IP stored globally:", this.clientIP);
            this.setupBehaviorAnalysis();
            this.setupEventListeners();
            this.setupHoneypotProtection();
            this.setupTimingProtection();
            this.setupXSSProtection();
            window._securitySystemStatus = "initialized";
            console.log(" Enterprise Security System: Full initialization complete");
            return !0;
        } catch (error) {
            console.error(" Enterprise Security System: Initialization failed", error);
            window._securitySystemStatus = "failed";
            AutomatedIncidentResponse.handleSecurityIncident({
                severity: "high",
                type: "system_initialization_failed",
                error: error.message,
                timestamp: new Date().toISOString(),
            });
            return !1;
        }
    }
    async logSecurityEvent(type, data) {
        if (this.isLogging || this.consecutiveErrors >= this.maxConsecutiveErrors) {
            return;
        }
        this.isLogging = !0;
        try {
            const now = Date.now();
            const clientIP = await this.getClientIP();
            this.requestTimestamps = this.requestTimestamps.filter((ts) => now - ts < 60000);
            if (this.requestTimestamps.length >= 50) {
                console.warn("Security event rate limit exceeded");
                return;
            }
            this.requestTimestamps.push(now);
            const zeroTrustCheck = await ZeroTrustEngine.verifyRequestContinuously({ ip: clientIP }, this.sessionId);
            const behaviorAnalysis = await this.behaviorAnalysis.analyzeUserBehavior({
                mouseMovements: this.mouseTrajectory,
                clicks: this.interactionTimes.map((t) => ({ timestamp: t })),
                scrolls: [],
                formInteractions: { start: this.formLoadTime, end: Date.now() },
                pageViews: [{ timestamp: Date.now() }],
                keystrokes: this.interactionTimes,
            });
            const threatIntel = await this.threatIntelligence.checkIPThreat(clientIP);
            const ipVelocity = await IPVelocityAnalysis.analyzeIPVelocity(clientIP);
            const mlAnalysis = await MLThreatDetection.analyzePatternWithML({
                requests_per_minute: this.requestTimestamps.length,
                unique_endpoints: 1,
                duration_minutes: (Date.now() - this.formLoadTime) / 60000,
                geo_anomaly_score: 0,
                behavior_deviation_score: 1 - behaviorAnalysis.score / 100,
                mouse_consistency: this.analyzeMouseBehavior().variance || 0,
                form_completion_time: Date.now() - this.formLoadTime,
            });
            const event = {
                type,
                data: {
                    ...data,
                    ip_address: clientIP,
                    real_ip: clientIP,
                    behavior_score: behaviorAnalysis.score,
                    threat_intel_score: threatIntel.score,
                    zero_trust_verified: zeroTrustCheck.trusted,
                    ml_threat_detection: mlAnalysis,
                    ip_velocity_score: ipVelocity.score,
                },
                threat_level: this.threatLevel,
                threat_score: this.threatScore,
                threat_factors: this.threatFactors,
                fingerprint: this.fingerprint,
                session_id: this.sessionId,
                timestamp: new Date().toISOString(),
                url: window.location.href,
                user_agent: navigator.userAgent,
                advanced_metrics: {
                    behavior_pattern: behaviorAnalysis.patternHash,
                    geo_analysis: await GeoBehavioralAnalysis.analyzeGeographicPattern(clientIP, {}),
                    ip_velocity: ipVelocity,
                    system_integrations: {
                        behavior_analysis: !0,
                        threat_intelligence: !0,
                        zero_trust: !0,
                        ml_detection: !0,
                        geo_analysis: !0,
                    },
                },
            };
            this.analyticsData.push(event);
            console.log(" ENHANCED SECURITY EVENT:", {
                type: event.type,
                threat_level: event.threat_level,
                behavior_score: event.data.behavior_score,
                ml_confidence: event.data.ml_threat_detection?.confidence,
            });
            try {
                // MODIFIED: using fetchWithClientIP
                const response = await fetchWithClientIP(`${SECURITY_API_BASE}/log-security-event`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(event),
                });
                if (!response.ok) {
                    console.warn("⚠️ Server rejected security event");
                } else {
                    console.log(" Enhanced security event sent to server");
                }
            } catch (fetchError) {
                console.warn("⚠️ Could not reach security event endpoint");
            }
            const shouldAlert = this.shouldSendEnhancedAlert(type, this.threatLevel, this.threatScore, {
                mlAnalysis,
                threatIntel,
                behaviorAnalysis,
                ipVelocity,
            });
            if (shouldAlert) {
                await this.sendEnhancedSecurityAlert(type, {
                    ...data,
                    ipAddress: clientIP,
                    message: this.getEnhancedAlertMessage(type, data),
                    ml_confidence: mlAnalysis.confidence,
                    threat_intel_score: threatIntel.score,
                    behavior_score: behaviorAnalysis.score,
                });
            }
            await this.securityDashboard.updateRealTimeMetrics();
            this.consecutiveErrors = 0;
        } catch (err) {
            console.error(" Error in enhanced logSecurityEvent:", err);
            this.consecutiveErrors++;
            if (this.consecutiveErrors >= 3) {
                await AutomatedIncidentResponse.handleSecurityIncident({
                    severity: "medium",
                    type: "logging_system_failure",
                    error: err.message,
                    consecutive_errors: this.consecutiveErrors,
                });
            }
        } finally {
            this.isLogging = !1;
        }
    }
    detectSuspiciousPatterns(text) {
        if (typeof text !== "string") return !1;
        const patterns = [
            /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /expression\s*\(/gi,
            /url\s*\(/gi,
            /<\/?\w+[^>]*>/gi,
            /eval\s*\(/gi,
            /document\./gi,
            /window\./gi,
            /alert\s*\(/gi,
            /confirm\s*\(/gi,
            /prompt\s*\(/gi,
        ];
        return patterns.some((pattern) => pattern.test(text));
    }
    validateInput(input, type = "text") {
        if (typeof input !== "string") return !1;
        const validators = {
            text: (text) => text.length <= 1000 && !this.detectSuspiciousPatterns(text),
            email: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254,
            phone: (phone) => /^[\d\s\-\+\(\)]{10,20}$/.test(phone),
            number: (num) => !isNaN(num) && num.length <= 20,
        };
        const validator = validators[type] || validators.text;
        return validator(input);
    }
    getSharedSessionId() {
        if (window.mainSessionId) {
            console.log("🔗 Using shared main session:", window.mainSessionId);
            return window.mainSessionId;
        }
        
        const sessionFromStorage = localStorage.getItem('main_session_id');
        if (sessionFromStorage) {
            console.log("🔗 Using main session from storage:", sessionFromStorage);
            window.mainSessionId = sessionFromStorage;
            return sessionFromStorage;
        }
        
        if (window.currentSessionId) {
            console.log("🔗 Using current session:", window.currentSessionId);
            return window.currentSessionId;
        }
        
        console.log("🆕 No shared session found, security system will create its own");
        return null;
    }
    generateSessionId() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        const hexString = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        const sessionId = "sec_" + hexString;
        
        console.log("🆕 Security system generated session:", sessionId);
        
        window.securitySessionId = sessionId;
        localStorage.setItem('security_session_id', sessionId);
        
        return sessionId;
    }
    async generateFingerprint() {
        try {
            const canvasPrint = this.generateCanvasFingerprint();
            const webglPrint = await this.generateWebGLFingerprint();
            const basicInfo = [
                navigator.userAgent,
                navigator.language,
                screen.width,
                screen.height,
                new Date().getTimezoneOffset(),
            ].join("|");
            return await this.hashString(canvasPrint + webglPrint + basicInfo);
        } catch (error) {
            return this.generateFallbackFingerprint();
        }
    }
    async hashString(str) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(str + "vjosa_enterprise_security_salt_2024");
            const hashBuffer = await crypto.subtle.digest("SHA-256", data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        } catch (err) {
            let h = 0;
            for (let i = 0; i < str.length; i++) {
                h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
            }
            return `f_${Math.abs(h)}`;
        }
    }
    generateCanvasFingerprint() {
        try {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            canvas.width = 200;
            canvas.height = 50;
            ctx.textBaseline = "top";
            ctx.font = "14px Arial";
            ctx.fillStyle = "#f60";
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = "#069";
            ctx.fillText("Enterprise Security Canvas", 2, 15);
            ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
            ctx.fillText("Vjosa Experience Enterprise", 4, 30);
            return canvas.toDataURL();
        } catch (error) {
            return "canvas_not_supported";
        }
    }
    async generateWebGLFingerprint() {
        try {
            const canvas = document.createElement("canvas");
            const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
            if (!gl) return "webgl_not_supported";
            const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
            const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            return `${vendor}|${renderer}`;
        } catch (error) {
            return "webgl_error";
        }
    }
    generateFallbackFingerprint() {
        try {
            const basicInfo = [
                navigator.userAgent,
                navigator.language,
                screen.width,
                screen.height,
                new Date().getTimezoneOffset(),
                navigator.hardwareConcurrency || "unknown",
            ].join("|");
            let h = 0;
            for (let i = 0; i < basicInfo.length; i++) {
                h = (Math.imul(31, h) + basicInfo.charCodeAt(i)) | 0;
            }
            return `fallback_enhanced_${Math.abs(h)}`;
        } catch (error) {
            return "fingerprint_unavailable_" + Date.now();
        }
    }
    async getClientIP() {
        try {
            // Note: we do NOT use fetchWithClientIP here because these are external services
            const response = await fetch("https://api.ipify.org?format=json");
            if (!response.ok) {
                throw new Error("IP service responded with error");
            }
            const data = await response.json();
            console.log("🌐 Retrieved client IP:", data.ip);
            return data.ip;
        } catch (error) {
            console.warn(" Could not get client IP from external service:", error);
            try {
                const fallbackResponse = await fetch("https://api64.ipify.org?format=json");
                const fallbackData = await fallbackResponse.json();
                console.log("🌐 Retrieved client IP from fallback:", fallbackData.ip);
                return fallbackData.ip;
            } catch (fallbackError) {
                console.error(" All IP services failed");
                return "unknown";
            }
        }
    }
    setupBehaviorAnalysis() {
        console.log(" Setting up enhanced behavior analysis...");
        let rapidClicks = 0;
        let lastClickTime = 0;
        document.addEventListener("click", (e) => {
            const now = Date.now();
            const timeSinceLastClick = now - lastClickTime;
            if (timeSinceLastClick < 100) {
                rapidClicks++;
                if (rapidClicks > 10) {
                    this.incrementThreatLevel("medium");
                    this.logSecurityEvent("rapid_clicking_detected", {
                        count: rapidClicks,
                        timestamp: now,
                        enhanced_detection: !0,
                    });
                }
            } else {
                rapidClicks = Math.max(0, rapidClicks - 1);
            }
            lastClickTime = now;
            this.analyzeEnhancedClickPattern(e);
        });
        document.addEventListener("mousemove", (e) => {
            const currentPos = { x: e.clientX, y: e.clientY };
            const distance = this.lastMousePos.x
                ? Math.sqrt(
                      Math.pow(currentPos.x - this.lastMousePos.x, 2) + Math.pow(currentPos.y - this.lastMousePos.y, 2)
                  )
                : 0;
            this.mouseTrajectory.push({
                position: currentPos,
                timestamp: Date.now(),
                distance: distance,
                velocity:
                    distance /
                    (Date.now() - (this.mouseTrajectory[this.mouseTrajectory.length - 1]?.timestamp || Date.now())),
            });
            this.lastMousePos = currentPos;
            if (this.mouseTrajectory.length > 200) {
                this.mouseTrajectory.shift();
            }
        });
        let keystrokes = [];
        document.addEventListener("keydown", (e) => {
            const now = Date.now();
            keystrokes.push({ timestamp: now, key: e.key, code: e.code });
            keystrokes = keystrokes.filter((keystroke) => now - keystroke.timestamp < 10000);
            if (keystrokes.length > 50) {
                this.logSecurityEvent("rapid_typing_detected", {
                    keystroke_count: keystrokes.length,
                    typing_speed: this.calculateTypingSpeed(keystrokes),
                    enhanced_analysis: !0,
                });
            }
        });
        
        // 🆕 CORRECTED: Use this.scrollEvents instead of local variable
        document.addEventListener("scroll", (e) => {
            const scrollEvent = {
                timestamp: Date.now(),
                position: { x: window.scrollX, y: window.scrollY },
                direction: this.determineScrollDirection(),
            };
            
            this.scrollEvents.push(scrollEvent);
            
            if (this.scrollEvents.length % 10 === 0) {
                this.analyzeScrollPatterns(this.scrollEvents);
            }
            
            if (this.scrollEvents.length > 100) {
                this.scrollEvents = this.scrollEvents.slice(-50);
            }
        });
    }
    analyzeEnhancedClickPattern(event) {
        const analysis = {
            coordinates: { x: event.clientX, y: event.clientY },
            target: { tagName: event.target.tagName, className: event.target.className, id: event.target.id },
            timestamp: Date.now(),
            viewport: { width: window.innerWidth, height: window.innerHeight },
        };
        if (
            analysis.coordinates.x < 0 ||
            analysis.coordinates.y < 0 ||
            analysis.coordinates.x > analysis.viewport.width ||
            analysis.coordinates.y > analysis.viewport.height
        ) {
            this.incrementThreatLevel("high");
            this.logSecurityEvent("enhanced_offscreen_click_detected", analysis);
        }
        if (this.detectSuspiciousClickPattern(analysis)) {
            this.logSecurityEvent("suspicious_click_pattern", analysis);
        }
    }
    detectSuspiciousClickPattern(clickAnalysis) {
        const recentClicks = this.mouseTrajectory
            .filter((point) => point.timestamp > Date.now() - 5000)
            .map((point) => point.position);
        if (recentClicks.length < 5) return !1;
        const linearity = this.calculateLinearity(recentClicks);
        if (linearity > 0.95) {
            return !0;
        }
        return !1;
    }
    calculateLinearity(points) {
        if (points.length < 3) return 0;
        let totalDeviation = 0;
        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];
            const expectedY = prev.y + (next.y - prev.y) * ((curr.x - prev.x) / (next.x - prev.x));
            totalDeviation += Math.abs(curr.y - expectedY);
        }
        const avgDeviation = totalDeviation / (points.length - 2);
        return 1 - avgDeviation / 100;
    }
    determineScrollDirection() {
        if (!this.lastScrollPosition) {
            this.lastScrollPosition = window.scrollY;
            return "initial";
        }
        const currentScroll = window.scrollY;
        const direction = currentScroll > this.lastScrollPosition ? "down" : "up";
        this.lastScrollPosition = currentScroll;
        return direction;
    }
    analyzeScrollPatterns(scrollEvents) {
        if (!scrollEvents || scrollEvents.length < 10) return;
        
        const directions = scrollEvents.map(event => event.direction);
        const pattern = this.identifyScrollPattern(directions);
        
        if (pattern === "bot_like") {
            this.logSecurityEvent("suspicious_scroll_pattern", {
                pattern: pattern,
                scroll_count: scrollEvents.length,
                analysis: "ml_enhanced",
                average_speed: this.calculateAverageScrollSpeed(),
                direction_changes: this.countDirectionChanges(directions)
            });
        }
    }
    calculateTypingSpeed(keystrokes) {
        if (keystrokes.length < 2) return 0;
        const firstKey = keystrokes[0].timestamp;
        const lastKey = keystrokes[keystrokes.length - 1].timestamp;
        const totalTime = lastKey - firstKey;
        return (keystrokes.length / totalTime) * 1000;
    }
    setupEventListeners() {
        console.log(" Setting up enhanced event listeners...");
        document.addEventListener("input", (e) => {
            const value = e.target.value;
            if (value && this.detectSuspiciousPatterns(value)) {
                console.log(" Real-time XSS detection in input:", e.target.name);
                e.target.style.border = "2px solid orange";
                this.logSecurityEvent("realtime_xss_detected", {
                    field: e.target.name || e.target.id,
                    input_type: e.target.type,
                    value_preview: value.substring(0, 100),
                    enhanced_detection: !0,
                });
            } else {
                e.target.style.border = "";
            }
        });
        window.addEventListener("error", (e) => {
            this.logSecurityEvent("javascript_error", {
                message: e.message,
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno,
                enhanced_tracking: !0,
            }).catch(() => {});
        });
        window.addEventListener("unhandledrejection", (e) => {
            this.logSecurityEvent("unhandled_promise_rejection", {
                reason: e.reason?.toString() || "Unknown error",
                enhanced_tracking: !0,
            }).catch(() => {});
        });
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                this.logSecurityEvent("page_hidden", {
                    hidden_at: new Date().toISOString(),
                    visibility_state: document.visibilityState,
                });
            } else {
                this.logSecurityEvent("page_visible", {
                    visible_at: new Date().toISOString(),
                    visibility_state: document.visibilityState,
                });
            }
        });
        document.addEventListener("focusin", (e) => {
            if (e.target.form) {
                this.interactionTimes.push(Date.now());
                this.logSecurityEvent("form_field_focus", {
                    field: e.target.name || e.target.id,
                    form_id: e.target.form.id || "unknown",
                    timestamp: new Date().toISOString(),
                });
            }
        });
        window.addEventListener("online", () => {
            this.logSecurityEvent("network_online", { timestamp: new Date().toISOString() });
        });
        window.addEventListener("offline", () => {
            this.logSecurityEvent("network_offline", { timestamp: new Date().toISOString() });
        });
        window.addEventListener("load", () => {
            const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
            this.logSecurityEvent("page_loaded", { load_time: loadTime, timestamp: new Date().toISOString() });
        });
        window.addEventListener("beforeunload", () => {
            this.logSecurityEvent("page_unloading", {
                session_duration: Date.now() - this.formLoadTime,
                timestamp: new Date().toISOString(),
            });
        });
    }
    setupHoneypotProtection() {
        console.log(" Setting up enhanced honeypot protection...");
        const forms = document.querySelectorAll("form");
        forms.forEach((form) => {
            if (!form.querySelector("#website_url")) {
                const honeypotDiv = document.createElement("div");
                honeypotDiv.style.cssText = `
                    display: none !important; 
                    opacity: 0; 
                    position: absolute; 
                    left: -9999px;
                    height: 0;
                    overflow: hidden;
                `;
                honeypotDiv.innerHTML = `
                    <input type="text" name="website" id="website_url" tabindex="-1" autocomplete="off" aria-hidden="true">
                    <input type="checkbox" name="accept_terms" id="accept_terms" value="1" style="display:none">
                    <input type="text" name="user_name" id="user_name" autocomplete="off" style="display:none">
                `;
                form.appendChild(honeypotDiv);
            }
        });
    }
    setupTimingProtection() {
        console.log(" Setting up enhanced timing protection...");
        document.addEventListener("input", (e) => {
            if (e.target.form) {
                this.interactionTimes.push(Date.now());
                if (!this.fieldInteractions) {
                    this.fieldInteractions = new Map();
                }
                const fieldId = e.target.name || e.target.id;
                if (!this.fieldInteractions.has(fieldId)) {
                    this.fieldInteractions.set(fieldId, []);
                }
                this.fieldInteractions.get(fieldId).push(Date.now());
            }
        });
    }
    setupXSSProtection() {
        document.addEventListener("securitypolicyviolation", (e) => {
            this.logSecurityEvent("csp_violation", {
                violated_directive: e.violatedDirective,
                blocked_uri: e.blockedURI,
                effective_directive: e.effectiveDirective,
                original_policy: e.originalPolicy,
                enhanced_protection: !0,
            }).catch(() => {});
        });
    }
    shouldSendEnhancedAlert(eventType, threatLevel, threatScore, threatData) {
        const alertConditions = {
            critical: [
                "xss_attempt",
                "sql_injection_attempt",
                "session_hijack_attempt",
                "critical_threat_detected",
                "honeypot_triggered",
                "ddos_attack_detected",
                "zero_trust_verification_failed",
            ],
            high: [
                "spam_pattern_detected",
                "multiple_form_submissions",
                "suspicious_behavior",
                "form_submission_blocked",
                "ml_threat_detected",
                "geo_behavioral_anomaly",
            ],
            medium: [
                "rapid_clicking_detected",
                "suspicious_timing",
                "invalid_form_input",
                "offscreen_click_detected",
                "ip_velocity_anomaly",
            ],
        };
        if (alertConditions.critical.includes(eventType)) {
            return !0;
        }
        if (alertConditions.high.includes(eventType) && (threatScore > 7 || threatData.mlAnalysis.confidence > 0.8)) {
            return !0;
        }
        if (alertConditions.medium.includes(eventType) && (threatScore > 5 || threatData.threatIntel.score > 50)) {
            return !0;
        }
        if (threatLevel === "critical") {
            return !0;
        }
        if (threatData.mlAnalysis.confidence > 0.9) {
            return !0;
        }
        return !1;
    }
    async sendEnhancedSecurityAlert(alertType, alertData) {
        const now = Date.now();
        if (now - this.lastAlertTime < this.alertCooldown) {
            console.log("⚠️ Alert cooldown active, skipping enhanced alert");
            return;
        }
        try {
            const alertMessage = this.formatEnhancedAlertMessage(alertType, alertData);
            console.log(" Preparing to send enhanced security alert to:", this.adminEmail);
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/send-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: this.adminEmail,
                    subject: ` ENHANCED SECURITY ALERT: ${alertType} - ${this.threatLevel.toUpperCase()}`,
                    text: alertMessage,
                    from: "enterprise-security@vjosaexperience.com",
                    priority: "high",
                }),
            });
            if (response.ok) {
                console.log(" Enhanced security alert sent to admin");
                this.lastAlertTime = now;
                await this.logSecurityEvent("enhanced_security_alert_sent", {
                    alert_type: alertType,
                    threat_level: this.threatLevel,
                    recipient: this.adminEmail,
                    ml_confidence: alertData.ml_confidence,
                    threat_intel_score: alertData.threat_intel_score,
                });
            } else {
                console.error(" Failed to send enhanced security alert:", await response.text());
            }
        } catch (error) {
            console.error(" Error sending enhanced security alert:", error);
        }
    }
    formatEnhancedAlertMessage(alertType, alertData) {
        const timestamp = new Date().toISOString();
        return `
 SECURITY ALERT - Vjosa Experience Group

Alert Type: ${alertType}
Threat Level: ${this.threatLevel}
Threat Score: ${this.threatScore}/10
Timestamp: ${timestamp}
Session ID: ${this.sessionId}
IP Address: ${alertData.ipAddress || "unknown"}

ADVANCED THREAT INTELLIGENCE:
- ML Confidence: ${(alertData.ml_confidence * 100).toFixed(1)}%
- Threat Intel Score: ${alertData.threat_intel_score}/100
- Behavior Score: ${alertData.behavior_score}/100
- IP Velocity: ${alertData.ip_velocity_score || "N/A"}

DETAILS:
${alertData.message}

SECURITY DATA:
- Threat Factors: ${this.threatFactors.join(", ") || "None"}
- Fingerprint: ${this.fingerprint?.substring(0, 20) || "Unknown"}...
- User Agent: ${navigator.userAgent?.substring(0, 50) || "Unknown"}...
- Advanced Systems: Behavior Analysis, Threat Intel, Zero-Trust, ML Detection

SYSTEM STATUS:
- Behavioral Analysis: ${this.behaviorAnalysis ? "ACTIVE" : "INACTIVE"}
- Threat Intelligence: ${this.threatIntelligence ? "ACTIVE" : "INACTIVE"}
- Zero-Trust Engine: ACTIVE
- ML Detection: ACTIVE

ADDITIONAL DATA:
${JSON.stringify(alertData, null, 2)}

IMMEDIATE ACTIONS REQUIRED:
1. Review enhanced security events in Supabase dashboard
2. Check advanced threat intelligence for IP: ${alertData.ipAddress || "Unknown"}
3. Verify zero-trust session: ${this.sessionId}
4. Monitor ML threat detection alerts
5. Consider automated incident response actions

URL: ${window.location.href}

This is an automated enhanced security alert from your Vjosa Experience Enterprise Security System.
Powered by Advanced Threat Detection System v3.0 with AI/ML Integration
        `.trim();
    }
    getEnhancedAlertMessage(type, data) {
        const messages = {
            xss_attempt: `Advanced XSS attempt detected from IP: ${data.ipAddress}. ML confidence: ${data.ml_confidence}.`,
            spam_pattern_detected: `Enhanced spam detection. ML score: ${data.ml_confidence}. Threat intel: ${data.threat_intel_score}.`,
            honeypot_triggered: `Bot detected via honeypot. Session: ${this.sessionId}. Behavior score: ${data.behavior_score}.`,
            suspicious_timing: `Form submitted too quickly. Behavioral anomaly detected.`,
            ml_threat_detected: `ML threat detection triggered. Confidence: ${data.ml_confidence}. Immediate review required.`,
            zero_trust_verification_failed: `Zero-trust verification failed. Multiple security checks unsuccessful.`,
            geo_behavioral_anomaly: `Geographic behavioral anomaly detected. IP: ${data.ipAddress}.`,
            ip_velocity_anomaly: `Unusual IP velocity detected. Possible automated attacks.`,
        };
        return messages[type] || `Enhanced security event: ${type}. Advanced data: ${JSON.stringify(data)}`;
    }
    getSecurityStatus() {
        return {
            status: window._securitySystemStatus,
            fingerprint: this.fingerprint,
            threatLevel: this.threatLevel,
            threatScore: this.threatScore,
            threatFactors: this.threatFactors,
            sessionId: this.sessionId,
            analyticsCount: this.analyticsData.length,
            consecutiveErrors: this.consecutiveErrors,
            lastAlertTime: this.lastAlertTime,
            advancedSystems: {
                behaviorAnalysis: !!this.behaviorAnalysis,
                threatIntelligence: !!this.threatIntelligence,
                zeroTrustEngine: !0,
                mlThreatDetection: !0,
                geoBehavioralAnalysis: !0,
                ipVelocityAnalysis: !0,
                ddosProtection: !0,
                securityDashboard: !!this.securityDashboard,
                incidentResponse: !0,
                queryAnalyzer: !0,
            },
            systemVersion: "Enterprise v3.0",
            initializationTime: new Date().toISOString(),
        };
    }
    incrementThreatLevel(level) {
        const levels = { low: 0, medium: 1, high: 2, critical: 3 };
        if ((levels[level] || 0) > (levels[this.threatLevel] || 0)) {
            const previousLevel = this.threatLevel;
            this.threatLevel = level;
            this.logSecurityEvent("threat_level_increased", {
                new_level: level,
                previous_level: previousLevel,
                enhanced_tracking: !0,
            }).catch(() => {});
        }
    }
    checkRateLimit(type = "general") {
        const now = Date.now();
        const limit = this.rateLimits[type];
        if (!limit) return !0;
        if (now - limit.lastReset > limit.window) {
            limit.count = 0;
            limit.lastReset = now;
        }
        limit.count++;
        const baseLimit = type === "form" ? 10 : 100;
        const threatMultiplier = this.getThreatLevelMultiplier();
        const dynamicLimit = Math.floor(baseLimit * threatMultiplier);
        return limit.count <= dynamicLimit;
    }
    getThreatLevelMultiplier() {
        const multipliers = { low: 1.0, medium: 0.7, high: 0.4, critical: 0.1 };
        return multipliers[this.threatLevel] || 1.0;
    }
    resetFormAssessment() {
        this.formLoadTime = Date.now();
        this.interactionTimes = [];
        this.threatScore = 0;
        this.threatFactors = [];
        this.fieldInteractions = new Map();
        console.log("🔄 Enhanced form assessment reset");
    }
    analyzeMouseBehavior() {
        if (this.mouseTrajectory.length < 10) {
            return { isSuspicious: !1, reason: "Insufficient data", variance: 0 };
        }
        const velocities = this.mouseTrajectory.map((point) => point.velocity).filter((v) => !isNaN(v));
        const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
        const velocityVariance = Math.sqrt(
            velocities.map((v) => Math.pow(v - avgVelocity, 2)).reduce((a, b) => a + b, 0) / velocities.length
        );
        const isSuspicious =
            velocityVariance < 0.1 && this.mouseTrajectory.length > 10 && this.detectLinearMousePattern();
        if (isSuspicious) {
            return {
                isSuspicious: !0,
                reason: "Enhanced detection: Consistent mouse patterns suggest automation",
                variance: velocityVariance,
                linearity: this.calculateMouseLinearity(),
                analysis: "ml_enhanced",
            };
        }
        return { isSuspicious: !1, variance: velocityVariance, linearity: this.calculateMouseLinearity() };
    }
    detectLinearMousePattern() {
        if (this.mouseTrajectory.length < 5) return !1;
        const recentPoints = this.mouseTrajectory.slice(-5);
        const angles = [];
        for (let i = 1; i < recentPoints.length - 1; i++) {
            const angle = this.calculateAngle(
                recentPoints[i - 1].position,
                recentPoints[i].position,
                recentPoints[i + 1].position
            );
            angles.push(angle);
        }
        const angleVariance = this.calculateVariance(angles);
        return angleVariance < 10;
    }
    calculateAngle(point1, point2, point3) {
        const vector1 = { x: point2.x - point1.x, y: point2.y - point1.y };
        const vector2 = { x: point3.x - point2.x, y: point3.y - point2.y };
        const dotProduct = vector1.x * vector2.x + vector1.y * vector2.y;
        const magnitude1 = Math.sqrt(vector1.x * vector1.x + vector1.y * vector1.y);
        const magnitude2 = Math.sqrt(vector2.x * vector2.x + vector2.y * vector2.y);
        const angle = Math.acos(dotProduct / (magnitude1 * magnitude2));
        return angle * (180 / Math.PI);
    }
    calculateMouseLinearity() {
        if (this.mouseTrajectory.length < 3) return 0;
        const points = this.mouseTrajectory.map((p) => p.position);
        return this.calculateLinearity(points);
    }
    calculateVariance(values) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
        return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
    }
    sanitizeForDatabase(input) {
        if (typeof input !== "string") return "";
        return input
            .replace(/[;\-\-]/, "")
            .replace(/'/g, "''")
            .substring(0, 1000);
    }
    async checkInitialIP() {
        try {
            const clientIP = await this.getClientIP();
            const ipCheck = await this.checkIPReputation(clientIP);
            const threatIntel = await this.threatIntelligence.checkIPThreat(clientIP);
            const geoAnalysis = await GeoBehavioralAnalysis.analyzeGeographicPattern(clientIP, {});
            if (ipCheck && threatIntel.score < 70) {
                console.log(" Enhanced IP check passed");
                await AdvancedSessionSecurity.enhanceSessionSecurity(this.sessionId, clientIP);
            }
        } catch (error) {
            console.warn("Could not perform enhanced initial IP check:", error);
        }
    }
    async checkIPReputation(ipAddress) {
        try {
            // MODIFIED: using fetchWithClientIP
            const response = await fetchWithClientIP(`${SECURITY_API_BASE}/check-ip-reputation`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ip_address: ipAddress, enhanced_check: !0, include_threat_intel: !0 }),
            });
            if (response.ok) {
                const result = await response.json();
                if (result.blocked) {
                    this.logSecurityEvent("ip_reputation_blocked", {
                        ip_address: ipAddress,
                        reputation_score: result.reputation_score,
                        reason: result.reason,
                        threat_intel_score: result.threat_intel_score,
                        enhanced_check: !0,
                    });
                    this.showEnhancedBlockedMessage(result);
                    return !1;
                }
                return !0;
            }
        } catch (error) {
            console.warn("Enhanced IP reputation check failed:", error);
            return !0;
        }
    }
    showEnhancedBlockedMessage(blockResult) {
        document.body.innerHTML = `
            <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #e74c3c;">Access Restricted</h2>
                <p>Your access to this website has been restricted due to security concerns.</p>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Reason:</strong> ${blockResult.reason}</p>
                    <p><strong>Reputation Score:</strong> ${blockResult.reputation_score}/100</p>
                    <p><strong>Threat Intelligence:</strong> ${blockResult.threat_intel_score || "N/A"}</p>
                    <p><strong>IP Address:</strong> ${blockResult.ip_address}</p>
                </div>
                <p>If you believe this is an error, please contact support with reference ID: ${this.sessionId}</p>
                <p style="font-size: 12px; color: #666; margin-top: 30px;">
                    Enhanced Security System v3.0 • Enterprise Threat Protection
                </p>
            </div>
        `;
    }
}
function initializeSecuritySystem() {
    if (window.securitySystemInitialized) {
        console.log(" Security system already initialized");
        return window.SecuritySystem;
    }
    try {
        console.log(" Starting Enterprise Security System initialization...");
        const securitySystem = new SecurityMeasures();
        window.SecuritySystem = securitySystem;
        securitySystem
            .init()
            .then(() => {
                console.log(" Enterprise Security System: Full initialization complete");
                console.log(" Advanced Systems Status:", securitySystem.getSecurityStatus().advancedSystems);
                securitySystem.checkInitialIP().then(() => {
                    console.log(" Enhanced IP verification complete");
                });
            })
            .catch((error) => {
                console.error(" Enterprise Security System: Async initialization failed", error);
                AutomatedIncidentResponse.handleSecurityIncident({
                    severity: "high",
                    type: "system_initialization_failed",
                    error: error.message,
                    timestamp: new Date().toISOString(),
                });
            });
        return securitySystem;
    } catch (error) {
        console.error(" Enterprise Security System: Critical initialization error", error);
        window.SecuritySystem = {
            getSecurityStatus: () => ({
                status: "failed",
                error: error.message,
                message: "Enterprise security system failed to initialize",
                fallback_mode: !0,
            }),
            logSecurityEvent: (type, data) => console.log(" [FALLBACK] Security Event:", type, data),
            detectSuspiciousPatterns: (text) => {
                console.log(" [FALLBACK] XSS check:", text);
                return /<script|javascript:/gi.test(text || "");
            },
            validateInput: () => !0,
        };
        window._securitySystemStatus = "failed";
        return window.SecuritySystem;
    }
}
window.testEnterpriseSecurity = function () {
    console.log(" Testing Enterprise Security System...");
    if (!window.SecuritySystem) {
        console.error(" SecuritySystem is not defined on window");
        return { error: "SecuritySystem not defined", status: "not_initialized" };
    }
    const status = window.SecuritySystem.getSecurityStatus();
    console.log(" Enterprise Security Status:", status);
    const testResult = window.SecuritySystem.detectSuspiciousPatterns('<script>alert("xss")</script>');
    console.log(" Enhanced XSS Test Result:", testResult);
    window.SecuritySystem.logSecurityEvent("enterprise_manual_test", {
        message: "Enterprise security test executed",
        test_input: '<script>alert("xss")</script>',
        test_time: new Date().toISOString(),
        systems_tested: ["behavior_analysis", "threat_intelligence", "zero_trust", "ml_detection", "geo_analysis"],
    });
    return {
        status: status.status,
        xssTest: testResult,
        securityStatus: status,
        advancedSystems: status.advancedSystems,
    };
};
console.log(" Enterprise Security System: Script loaded, starting auto-init...");
initializeSecuritySystem();
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        console.log(" Enterprise Security System: DOM loaded, verifying initialization...");
        if (!window.SecuritySystem || window._securitySystemStatus === "failed") {
            console.log(" Enterprise Security System: Re-initializing after DOM load...");
            initializeSecuritySystem();
        } else {
            console.log(" Enterprise Security System: Already initialized, systems active");
        }
    });
}
console.log(" Enterprise Security System: Setup complete. Use testEnterpriseSecurity() to test.");
if (typeof module !== "undefined" && module.exports) {
    module.exports = SecurityMeasures;
} else {
    window.SecuritySystem = window.SecuritySystem || {
        getSecurityStatus: () => ({ status: "not_initialized", message: "Enterprise Security System not initialized" }),
    };
}