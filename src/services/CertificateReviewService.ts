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
  /** Admin/onboarder stable id (analytics) */
  reviewedByUserId?: string;
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
    try {
      const response = await axios.get<UserProfileResponse>(
        `${this.getProfileBaseUrl()}/internal/${uid}`,
        { headers: this.getHeaders(actorUid) }
      );

      const profile = response.data?.profile || response.data;
      if (!profile?.uid) {
        throw new Error('Profile not found');
      }
      return profile;
    } catch (error: any) {
      const status = error?.response?.status;
      const remoteMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message;

      if (status === 404) {
        throw new Error('Profile not found');
      }
      if (status === 403) {
        throw new Error('Profile access denied');
      }

      logger.error('Failed to fetch profile for certificate review', {
        uid,
        status,
        message: remoteMessage,
      });
      throw new Error(remoteMessage || 'Failed to fetch profile from user-service');
    }
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
    onlyOwnReviewedDecisions?: boolean;
    reviewerUserId?: string;
    reviewerIdentities?: string[];
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
        ...(params.status ? { status: params.status } : {}),
        city: params.city,
        page: params.page || 1,
        limit: params.limit || 20,
        ...(params.onlyOwnReviewedDecisions
          ? { onlyOwnReviewedDecisions: 'true' }
          : {}),
        ...(params.reviewerUserId
          ? { reviewerUserId: params.reviewerUserId }
          : {}),
        ...(params.reviewerIdentities && params.reviewerIdentities.length > 0
          ? { reviewerIdentities: params.reviewerIdentities.join(',') }
          : {}),
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

  static async getAnalyticsFromUserService(params: {
    actorUid: string;
    from?: string;
    to?: string;
  }): Promise<Record<string, unknown>> {
    const response = await axios.get<{
      success?: boolean;
      data?: Record<string, unknown>;
    }>(`${this.getProfileBaseUrl()}/internal/certificates/analytics`, {
      headers: this.getHeaders(params.actorUid),
      params: {
        from: params.from,
        to: params.to,
      },
    });

    return response.data?.data || {};
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
      reviewedByUserId: actorUid,
      reviewedAt: nowIso,
      reviewNotes: reviewNotes?.trim() || undefined,
      rejectionReason: nextStatus === 'rejected' ? rejectionReason?.trim() : undefined,
    };

    const updatedSkill: ProfileSkill = {
      ...skill,
      certificates,
      verified: nextStatus === 'verified',
      certified: nextStatus === 'verified',
    };

    const updatedSkills = [...skills];
    updatedSkills[skillIndex] = updatedSkill;

    try {
      await axios.put(
        `${this.getProfileBaseUrl()}/internal/${uid}`,
        {
          // Only send skills.list — avoid re-validating legacy primaryCategory values
          skills: {
            list: updatedSkills,
          },
        },
        { headers: this.getHeaders(actorUid) }
      );
    } catch (error: any) {
      const status = error?.response?.status;
      const remoteMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message;

      logger.error('Failed to persist certificate review', {
        uid,
        skillIndex,
        certificateIndex,
        status,
        message: remoteMessage,
      });

      if (status === 404) {
        throw new Error('Profile not found');
      }
      if (status === 400) {
        throw new Error(remoteMessage || 'Invalid profile update payload');
      }

      throw new Error(remoteMessage || 'Failed to update profile in user-service');
    }

    logger.info('Certificate review status updated', {
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
