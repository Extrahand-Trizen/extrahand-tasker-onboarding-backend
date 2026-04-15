import axios from 'axios';
import { env } from '../config/env';
import logger from '../config/logger';

export type CertificateStatus = 'pending' | 'verified' | 'rejected';

interface ProfileCertificate {
  uploadedAt?: string;
  title?: string;
  issuedBy?: string;
  issuedDate?: string;
  documentUrl?: string;
  verificationType?: 'certified' | 'licensed';
  certificateType?: string;
  issuingAuthority?: string;
  certificateNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  status?: CertificateStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  reviewNotes?: string;
}

interface ProfileSkill {
  name?: string;
  certified?: boolean;
  verified?: boolean;
  certificates?: ProfileCertificate[];
}

interface UserProfileResponse {
  success?: boolean;
  profile?: any;
  uid?: string;
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  location?: { city?: string };
  skills?: {
    list?: ProfileSkill[];
  };
}

export interface CertificateQueueItem {
  uid: string;
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  skillIndex: number;
  skillName: string;
  certificateIndex: number;
  certificate: ProfileCertificate;
}

export class CertificateReviewService {
  private static getHeaders(actorUid: string) {
    return {
      'X-Service-Auth': env.SERVICE_AUTH_TOKEN,
      'X-Service-Name': 'admin-service',
      'X-User-Id': actorUid,
      'Content-Type': 'application/json',
    };
  }

  private static getProfileBaseUrl(): string {
    if (!env.USER_SERVICE_URL) {
      throw new Error('USER_SERVICE_URL is not configured');
    }
    return `${env.USER_SERVICE_URL}/api/v1/profiles`;
  }

  static async getProfileByUid(uid: string, actorUid: string): Promise<any> {
    const response = await axios.get<UserProfileResponse>(
      `${this.getProfileBaseUrl()}/${uid}`,
      { headers: this.getHeaders(actorUid) }
    );

    const profile = response.data?.profile || response.data;
    if (!profile?.uid) {
      throw new Error('Profile not found');
    }
    return profile;
  }

  static async searchProfiles(searchQuery: string, actorUid: string): Promise<any[]> {
    const response = await axios.get<{ success?: boolean; users?: any[] }>(
      `${this.getProfileBaseUrl()}/search`,
      {
        headers: this.getHeaders(actorUid),
        params: {
          q: searchQuery,
          limit: 50,
        },
      }
    );

    return response.data?.users || [];
  }

  static async getQueueFromUserService(params: {
    actorUid: string;
    uid?: string;
    q?: string;
    status?: CertificateStatus;
    city?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: CertificateQueueItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const response = await axios.get<{
      success?: boolean;
      data?: {
        items?: CertificateQueueItem[];
        pagination?: { page?: number; limit?: number; total?: number; totalPages?: number };
      };
    }>(`${this.getProfileBaseUrl()}/internal/certificates/queue`, {
      headers: this.getHeaders(params.actorUid),
      params: {
        uid: params.uid,
        q: params.q,
        status: params.status,
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

  static buildQueueFromProfiles(
    profiles: any[],
    filters?: { status?: CertificateStatus; city?: string; sortByLatest?: boolean }
  ): CertificateQueueItem[] {
    const desiredStatus = filters?.status;
    const desiredCity = filters?.city?.trim().toLowerCase();

    const queue: CertificateQueueItem[] = [];

    for (const profile of profiles) {
      const skills: ProfileSkill[] = profile?.skills?.list || [];
      const profileCity = (
        profile?.city ||
        profile?.location?.city ||
        ''
      ).toString().toLowerCase();

      if (desiredCity && profileCity && !profileCity.includes(desiredCity)) {
        continue;
      }

      skills.forEach((skill, skillIndex) => {
        const certificates: ProfileCertificate[] = skill?.certificates || [];
        certificates.forEach((certificate, certificateIndex) => {
          const certificateStatus: CertificateStatus = certificate?.status || 'pending';
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
        const aDate =
          a.certificate.uploadedAt ||
          a.certificate.issueDate ||
          a.certificate.issuedDate ||
          a.certificate.reviewedAt ||
          '';
        const bDate =
          b.certificate.uploadedAt ||
          b.certificate.issueDate ||
          b.certificate.issuedDate ||
          b.certificate.reviewedAt ||
          '';
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });
    }

    return queue;
  }

  static async updateCertificateStatus(params: {
    uid: string;
    skillIndex: number;
    certificateIndex: number;
    nextStatus: CertificateStatus;
    actorUid: string;
    actorName?: string;
    actorEmail?: string;
    rejectionReason?: string;
    reviewNotes?: string;
  }) {
    const {
      uid,
      skillIndex,
      certificateIndex,
      nextStatus,
      actorUid,
      actorName,
      actorEmail,
      rejectionReason,
      reviewNotes,
    } = params;

    const profile = await this.getProfileByUid(uid, actorUid);
    const skills: ProfileSkill[] = profile?.skills?.list || [];

    if (!Number.isInteger(skillIndex) || skillIndex < 0 || skillIndex >= skills.length) {
      throw new Error('Invalid skill index');
    }

    const skill = skills[skillIndex];
    const certificates: ProfileCertificate[] = skill?.certificates || [];
    if (
      !Number.isInteger(certificateIndex) ||
      certificateIndex < 0 ||
      certificateIndex >= certificates.length
    ) {
      throw new Error('Invalid certificate index');
    }

    const certificate = certificates[certificateIndex];
    const currentStatus: CertificateStatus = certificate?.status || 'pending';

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
      reviewedAt: nowIso,
      reviewNotes: reviewNotes?.trim() || undefined,
      rejectionReason: nextStatus === 'rejected' ? rejectionReason?.trim() : undefined,
    };

    const updatedSkill: ProfileSkill = {
      ...skill,
      certificates,
      // For now, mark the reviewed skill as verified/certified on approval.
      verified: nextStatus === 'verified' ? true : skill?.verified,
      certified: nextStatus === 'verified' ? true : skill?.certified,
    };

    const updatedSkills = [...skills];
    updatedSkills[skillIndex] = updatedSkill;

    await axios.put(
      `${this.getProfileBaseUrl()}/internal/${uid}`,
      {
        skills: {
          ...(profile?.skills || {}),
          list: updatedSkills,
        },
      },
      { headers: this.getHeaders(actorUid) }
    );

    logger.info('Certificate review status updated', {
      uid,
      skillIndex,
      certificateIndex,
      previousStatus: currentStatus,
      nextStatus,
      reviewedBy: actorUid,
      reviewedByName: actorName,
    });
  }
}
