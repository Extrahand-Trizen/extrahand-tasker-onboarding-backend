import { uploadFile, getStorageType } from '../utils/storage/storageManager';
import logger from '../config/logger';

export class UploadService {
  /**
   * Upload document (image/pdf) and return URL/key.
   * Used for onboarding document uploads (Aadhaar, PAN, photos, etc.)
   */
  static async uploadDocument(
    adminUid: string,
    fileBuffer: Buffer,
    filename: string,
    mimetype: string,
    docType: string = 'document',
    leadId?: string
  ): Promise<{ url: string; key: string }> {
    if (!fileBuffer || !filename) {
      throw new Error('No file provided');
    }

    // Upload to storage (MinIO/S3)
    const result = await uploadFile(
      fileBuffer,
      filename,
      mimetype,
      'onboarding-documents', // folder name
      {
        adminUid,
        type: docType,
        leadId,
      }
    );

    logger.info('Document uploaded', {
      adminUid,
      leadId,
      docType,
      url: result.url,
      key: result.key,
      provider: getStorageType()
    });

    return {
      url: result.url,
      key: result.key
    };
  }
}
