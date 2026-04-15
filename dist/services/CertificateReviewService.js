"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CertificateReviewService = void 0;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const logger_1 = __importDefault(require("../config/logger"));
class CertificateReviewService {
    static getHeaders(actorUid) {
        return {
            'X-Service-Auth': env_1.env.SERVICE_AUTH_TOKEN,
            'X-Service-Name': 'admin-service',
            'X-User-Id': actorUid,
            'Content-Type': 'application/json',
        };
    }
    static getProfileBaseUrl() {
        if (!env_1.env.USER_SERVICE_URL) {
            throw new Error('USER_SERVICE_URL is not configured');
        }
        return `${env_1.env.USER_SERVICE_URL}/api/v1/profiles`;
    }
    static async getProfileByUid(uid, actorUid) {
        const response = await axios_1.default.get(`${this.getProfileBaseUrl()}/${uid}`, { headers: this.getHeaders(actorUid) });
        const profile = response.data?.profile || response.data;
        if (!profile?.uid) {
            throw new Error('Profile not found');
        }
        return profile;
    }
    static async searchProfiles(searchQuery, actorUid) {
        const response = await axios_1.default.get(`${this.getProfileBaseUrl()}/search`, {
            headers: this.getHeaders(actorUid),
            params: {
                q: searchQuery,
                limit: 50,
            },
        });
        return response.data?.users || [];
    }
    static async getQueueFromUserService(params) {
        const response = await axios_1.default.get(`${this.getProfileBaseUrl()}/internal/certificates/queue`, {
            headers: this.getHeaders(params.actorUid),
            params: {
                uid: params.uid,
                q: params.q,
                ...(params.status ? { status: params.status } : {}),
                city: params.city,
                page: params.page || 1,
                limit: params.limit || 20,
            },
        });
        return {
            items: response.data?.data?.items || [],
            pagination: {
                page: response.data?.data?.pagination?.page || params.page || 1,
                limit: response.data?.data?.pagination?.limit || params.limit || 20,
                total: response.data?.data?.pagination?.total || 0,
                totalPages: response.data?.data?.pagination?.totalPages || 0,
            },
        };
    }
    static async getAnalyticsFromUserService(params) {
        const response = await axios_1.default.get(`${this.getProfileBaseUrl()}/internal/certificates/analytics`, {
            headers: this.getHeaders(params.actorUid),
            params: {
                from: params.from,
                to: params.to,
            },
        });
        return response.data?.data || {};
    }
    static buildQueueFromProfiles(profiles, filters) {
        const desiredStatus = filters?.status;
        const desiredCity = filters?.city?.trim().toLowerCase();
        const queue = [];
        for (const profile of profiles) {
            const skills = profile?.skills?.list || [];
            const profileCity = (profile?.city ||
                profile?.location?.city ||
                '').toString().toLowerCase();
            if (desiredCity && profileCity && !profileCity.includes(desiredCity)) {
                continue;
            }
            skills.forEach((skill, skillIndex) => {
                const certificates = skill?.certificates || [];
                certificates.forEach((certificate, certificateIndex) => {
                    const certificateStatus = certificate?.status || 'pending';
                    if (desiredStatus && certificateStatus !== desiredStatus) {
                        return;
                    }
                    if (!certificate?.documentUrl) {
                        return;
                    }
                    queue.push({
                        uid: profile.uid,
                        name: profile.name,
                        email: profile.email,
                        phone: profile.phone,
                        city: profile?.city || profile?.location?.city,
                        skillIndex,
                        skillName: skill?.name || 'Unknown Skill',
                        certificateIndex,
                        certificate: {
                            ...certificate,
                            status: certificateStatus,
                        },
                    });
                });
            });
        }
        if (filters?.sortByLatest) {
            queue.sort((a, b) => {
                const aDate = a.certificate.uploadedAt ||
                    a.certificate.issueDate ||
                    a.certificate.issuedDate ||
                    a.certificate.reviewedAt ||
                    '';
                const bDate = b.certificate.uploadedAt ||
                    b.certificate.issueDate ||
                    b.certificate.issuedDate ||
                    b.certificate.reviewedAt ||
                    '';
                return new Date(bDate).getTime() - new Date(aDate).getTime();
            });
        }
        return queue;
    }
    static async updateCertificateStatus(params) {
        const { uid, skillIndex, certificateIndex, nextStatus, actorUid, actorName, actorEmail, rejectionReason, reviewNotes, } = params;
        const profile = await this.getProfileByUid(uid, actorUid);
        const skills = profile?.skills?.list || [];
        if (!Number.isInteger(skillIndex) || skillIndex < 0 || skillIndex >= skills.length) {
            throw new Error('Invalid skill index');
        }
        const skill = skills[skillIndex];
        const certificates = skill?.certificates || [];
        if (!Number.isInteger(certificateIndex) ||
            certificateIndex < 0 ||
            certificateIndex >= certificates.length) {
            throw new Error('Invalid certificate index');
        }
        const certificate = certificates[certificateIndex];
        const currentStatus = certificate?.status || 'pending';
        if (currentStatus !== 'pending') {
            throw new Error(`Certificate already reviewed with status: ${currentStatus}`);
        }
        if (nextStatus === 'rejected' && !rejectionReason?.trim()) {
            throw new Error('rejectionReason is required when rejecting a certificate');
        }
        const nowIso = new Date().toISOString();
        const reviewerDisplayName = actorName?.trim() || actorEmail?.trim() || actorUid;
        certificates[certificateIndex] = {
            ...certificate,
            status: nextStatus,
            reviewedBy: reviewerDisplayName,
            reviewedByUserId: actorUid,
            reviewedAt: nowIso,
            reviewNotes: reviewNotes?.trim() || undefined,
            rejectionReason: nextStatus === 'rejected' ? rejectionReason?.trim() : undefined,
        };
        const updatedSkill = {
            ...skill,
            certificates,
            // For now, mark the reviewed skill as verified/certified on approval.
            verified: nextStatus === 'verified' ? true : skill?.verified,
            certified: nextStatus === 'verified' ? true : skill?.certified,
        };
        const updatedSkills = [...skills];
        updatedSkills[skillIndex] = updatedSkill;
        await axios_1.default.put(`${this.getProfileBaseUrl()}/internal/${uid}`, {
            skills: {
                ...(profile?.skills || {}),
                list: updatedSkills,
            },
        }, { headers: this.getHeaders(actorUid) });
        logger_1.default.info('Certificate review status updated', {
            uid,
            skillIndex,
            certificateIndex,
            previousStatus: currentStatus,
            nextStatus,
            reviewedByUserId: actorUid,
            reviewedByName: reviewerDisplayName,
        });
    }
}
exports.CertificateReviewService = CertificateReviewService;
//# sourceMappingURL=CertificateReviewService.js.map