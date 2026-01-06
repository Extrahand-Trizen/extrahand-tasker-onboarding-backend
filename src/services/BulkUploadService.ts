import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import axios from "axios";
import logger from "../config/logger";
import BulkImport from "../models/BulkImport";
import { LeadService } from "./LeadService";
import { UserCreationService } from "./UserCreationService";
import { DuplicateCheckService } from "./DuplicateCheckService";
import { env } from "../config/env";

export interface ParsedUser {
  operation?: "create" | "update" | "delete";
  uid?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string; // Local Area
  city?: string;
  state?: string;
  pincode?: string;
  primaryCategory?: string; // New field name
  primarySkill?: string; // Legacy field name
  secondaryCategory?: string; // New field name
  secondarySkill?: string; // Legacy field name
  experienceLevel?: string;
  yearsOfExperience?: number; // Optional - will be derived from experienceLevel if not provided
  workingDays?: string;
  preferredTimeSlot?: string;
  source?: string;
  agentCampaignId?: string;
  skillsList?: string;
  isActive?: boolean;
  reason?: string;
}

export interface BulkUploadResult {
  importId: string;
  operation: "create" | "update" | "delete" | "mixed";
  success: number;
  failed: number;
  errors: Array<{ row: number; uid?: string; phone?: string; error: string }>;
  importedLeadIds: string[];
  importedUserIds: string[]; // Firebase UIDs
  updatedUserIds?: string[];
  deletedUserIds?: string[];
}

export class BulkUploadService {
  /**
   * Parse CSV/Excel file
   */
  static parseFile(
    buffer: Buffer,
    fileName: string,
    defaultPrimaryCategory?: string,
    defaultSecondaryCategory?: string
  ): ParsedUser[] {
    const ext = fileName.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      const records = parse(buffer.toString(), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
      return this.normalizeRecords(
        records,
        defaultPrimaryCategory,
        defaultSecondaryCategory
      );
    } else if (["xlsx", "xls"].includes(ext || "")) {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json(sheet);
      return this.normalizeRecords(
        records,
        defaultPrimaryCategory,
        defaultSecondaryCategory
      );
    }

    throw new Error("Unsupported file format. Use CSV or Excel (.xlsx, .xls)");
  }

  /**
   * Normalize records to ParsedUser format
   */
  private static normalizeRecords(
    records: any[],
    defaultPrimaryCategory?: string,
    defaultSecondaryCategory?: string
  ): ParsedUser[] {
    return records.map((record) => {
      // Detect operation type (default to 'create' if not specified)
      const operation = (
        record.operation ||
        record.Operation ||
        "create"
      ).toLowerCase();

      // Get primary category from CSV or use default
      const primaryCategoryValue =
        record.primaryCategory ||
        record.PrimaryCategory ||
        record["Primary Category"] ||
        record.primarySkill ||
        record.PrimarySkill ||
        record["Primary Skill"] ||
        record["Primary Skill (Service Category)"] ||
        defaultPrimaryCategory ||
        "other";

      // Get secondary category from CSV or use default
      const secondaryCategoryValue =
        record.secondaryCategory ||
        record.SecondaryCategory ||
        record["Secondary Category"] ||
        record.secondarySkill ||
        record.SecondarySkill ||
        record["Secondary Skill"] ||
        defaultSecondaryCategory ||
        undefined;

      return {
        operation: operation as "create" | "update" | "delete",
        uid: record.uid || record.UID || undefined,
        name:
          record.name || record.Name || record["Full Name"] || "Unknown Tasker",
        phone:
          record.phone ||
          record.Phone ||
          record["Phone Number"] ||
          record["Mobile Number"] ||
          `9${Math.floor(100000000 + Math.random() * 900000000)}`,
        email: record.email || record.Email || undefined,
        address:
          record.address ||
          record.Address ||
          record["Local Area"] ||
          "Unknown Address",
        city: record.city || record.City || record["City / Area"] || "Unknown",
        state: record.state || record.State || undefined,
        pincode:
          record.pincode ||
          record.Pincode ||
          record.pinCode ||
          record.Pincode ||
          "000000",
        primaryCategory: primaryCategoryValue,
        primarySkill: primaryCategoryValue, // For backward compatibility
        secondaryCategory: secondaryCategoryValue,
        secondarySkill: secondaryCategoryValue, // For backward compatibility
        experienceLevel:
          record.experienceLevel ||
          record.ExperienceLevel ||
          record["Experience Level"] ||
          record["Experience Level (beginner/intermediate/experienced)"] ||
          undefined,
        yearsOfExperience:
          record.yearsOfExperience ||
          record.YearsOfExperience ||
          record["Years of Experience"] ||
          record["Years Of Experience"] ||
          record["Years of Experience (optional)"]
            ? parseInt(
                record.yearsOfExperience ||
                  record.YearsOfExperience ||
                  record["Years of Experience"] ||
                  record["Years Of Experience"] ||
                  record["Years of Experience (optional)"] ||
                  "0",
                10
              )
            : undefined,
        workingDays:
          record.workingDays ||
          record.WorkingDays ||
          record["Working Days"] ||
          record["Working Days (optional)"] ||
          undefined,
        preferredTimeSlot:
          record.preferredTimeSlot ||
          record.PreferredTimeSlot ||
          record["Preferred Time Slot"] ||
          record["Preferred TimeSlot"] ||
          record["Preferred Time Slot (optional)"] ||
          undefined,
        source:
          record.source ||
          record.Source ||
          record["Source (referral/campaign/walk-in/agent/other)"] ||
          "other",
        agentCampaignId:
          record.agentCampaignId ||
          record.AgentCampaignId ||
          record["Agent / Campaign ID"] ||
          "DIRECT_UPLOAD",
        skillsList:
          record.skills || record.Skills || record.skillsList || undefined,
        isActive:
          record.isActive !== undefined
            ? record.isActive === "true" ||
              record.isActive === true ||
              record.isActive === 1
            : undefined,
        reason: record.reason || record.Reason || undefined,
      };
    });
  }

  /**
   * Validate parsed users based on operation type
   */
  static validateUsers(users: ParsedUser[]): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (users.length === 0) {
      errors.push("File is empty");
    }

    if (users.length > 10000) {
      errors.push("Maximum 10000 operations per import");
    }

    // Detect operation types
    const operations = new Set(users.map((u) => u.operation || "create"));
    const isMixed = operations.size > 1;

    users.forEach((user, index) => {
      const row = index + 2; // +2 for header row and 0-index
      const operation = user.operation || "create";

      // Validate based on operation type
      if (operation === "update" || operation === "delete") {
        if (!user.uid || user.uid.trim() === "") {
          errors.push(`Row ${row}: UID is required for ${operation} operation`);
        }
      }

      if (operation === "create") {
        if (!user.name || user.name.trim() === "") {
          errors.push(`Row ${row}: Full Name is required for create operation`);
        }

        // if (!user.phone) {
        //   errors.push(
        //     `Row ${row}: Mobile Number is required for create operation`
        //   );
        // }

        // if (user.phone && !this.isValidPhone(user.phone)) {
        //   errors.push(
        //     `Row ${row}: Invalid phone format: ${user.phone}. Expected E.164 format (e.g., +919876543210)`
        //   );
        // }

        // if (!user.city || user.city.trim() === "") {
        //   errors.push(`Row ${row}: City is required for create operation`);
        // }

        // if (!user.address || user.address.trim() === "") {
        //   errors.push(
        //     `Row ${row}: Local Area is required for create operation`
        //   );
        // }

        // if (!user.pincode || user.pincode.trim() === "") {
        //   errors.push(`Row ${row}: Pincode is required for create operation`);
        // }

        // if (!user.primarySkill || user.primarySkill.trim() === "") {
        //   errors.push(
        //     `Row ${row}: Primary Skill is required for create operation`
        //   );
        // }

        // if (!user.source || user.source.trim() === "") {
        //   errors.push(`Row ${row}: Source is required for create operation`);
        // }

        // if (!user.agentCampaignId || user.agentCampaignId.trim() === "") {
        //   errors.push(
        //     `Row ${row}: Agent / Campaign ID is required for create operation`
        //   );
        // }
      }

      if (operation === "update") {
        // At least one field besides uid should be provided
        const hasUpdateFields =
          user.name ||
          user.phone ||
          user.address ||
          user.skillsList ||
          user.isActive !== undefined;
        if (!hasUpdateFields) {
          errors.push(`Row ${row}: At least one field to update is required`);
        }

        // Validate phone if provided
        if (user.phone && !this.isValidPhone(user.phone)) {
          errors.push(`Row ${row}: Invalid phone format: ${user.phone}`);
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Process bulk operations (create, update, delete) - Optimized with Firebase and MongoDB bulk operations
   */
  static async processBulkUpload(
    fileBuffer: Buffer,
    fileName: string,
    adminUid: string,
    defaultPrimaryCategory?: string,
    defaultSecondaryCategory?: string
  ): Promise<BulkUploadResult> {
    // 1. Parse file with default categories
    const users = this.parseFile(
      fileBuffer,
      fileName,
      defaultPrimaryCategory,
      defaultSecondaryCategory
    );

    // 2. Validate categories match (if provided)
    if (defaultPrimaryCategory && defaultSecondaryCategory) {
      const categoryMismatches: string[] = [];
      users.forEach((user, index) => {
        const userPrimaryCategory = (
          user.primaryCategory ||
          user.primarySkill ||
          ""
        )
          .trim()
          .toLowerCase();
        const userSecondaryCategory = (
          user.secondaryCategory ||
          user.secondarySkill ||
          ""
        ).trim();

        // If user has categories in CSV, they must match the provided defaults
        if (
          userPrimaryCategory &&
          userPrimaryCategory !== defaultPrimaryCategory.toLowerCase()
        ) {
          categoryMismatches.push(
            `Row ${
              index + 2
            }: Primary category mismatch. Expected: ${defaultPrimaryCategory}, found: ${userPrimaryCategory}`
          );
        }

        if (
          userSecondaryCategory &&
          userSecondaryCategory !== defaultSecondaryCategory
        ) {
          categoryMismatches.push(
            `Row ${
              index + 2
            }: Secondary category mismatch. Expected: ${defaultSecondaryCategory}, found: ${userSecondaryCategory}`
          );
        }
      });

      if (categoryMismatches.length > 0) {
        throw new Error(
          `Category validation failed:\n${categoryMismatches
            .slice(0, 10)
            .join("\n")}${
            categoryMismatches.length > 10
              ? `\n... and ${categoryMismatches.length - 10} more mismatches`
              : ""
          }`
        );
      }
    }

    // 3. Validate
    const validation = this.validateUsers(users);
    if (!validation.isValid) {
      throw new Error(`Validation failed:\n${validation.errors.join("\n")}`);
    }

    // 3. Detect operation type
    const operations = new Set(users.map((u) => u.operation || "create"));
    const operationType =
      operations.size > 1
        ? "mixed"
        : ((Array.from(operations)[0] || "create") as
            | "create"
            | "update"
            | "delete");

    // 4. Create import record
    const importId = `import_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    await BulkImport.create({
      importId,
      adminUid,
      fileName,
      totalRows: users.length,
      status: "processing",
      operationType,
    });

    const result: BulkUploadResult = {
      importId,
      operation: operationType,
      success: 0,
      failed: 0,
      errors: [],
      importedLeadIds: [],
      importedUserIds: [],
      updatedUserIds: [],
      deletedUserIds: [],
    };

    // 5. Separate users by operation type
    const createUsers = users.filter(
      (u) => (u.operation || "create") === "create"
    );
    const updateUsers = users.filter((u) => u.operation === "update");
    const deleteUsers = users.filter((u) => u.operation === "delete");

    // 6. Process creates (creates leads + Firebase users + MongoDB profiles)
    if (createUsers.length > 0) {
      const createResult = await this.processCreates(
        createUsers,
        importId,
        adminUid
      );
      result.success += createResult.success;
      result.failed += createResult.failed;
      result.importedLeadIds.push(...createResult.leadIds);
      result.importedUserIds.push(...createResult.userIds);
      result.errors.push(...createResult.errors);
    }

    // 7. Process updates
    if (updateUsers.length > 0) {
      const updateResult = await this.processUpdates(updateUsers, importId);
      result.success += updateResult.success;
      result.failed += updateResult.failed;
      result.updatedUserIds!.push(...updateResult.userIds);
      result.errors.push(...updateResult.errors);
    }

    // 8. Process deletes
    if (deleteUsers.length > 0) {
      const deleteResult = await this.processDeletes(deleteUsers, importId);
      result.success += deleteResult.success;
      result.failed += deleteResult.failed;
      result.deletedUserIds!.push(...deleteResult.userIds);
      result.errors.push(...deleteResult.errors);
    }

    // 9. Final update
    await BulkImport.updateOne(
      { importId },
      {
        status: "completed",
        completedAt: new Date(),
        importedUserIds: result.importedUserIds, // Store Firebase UIDs
        updatedUserIds: result.updatedUserIds || [],
        deletedUserIds: result.deletedUserIds || [],
      }
    );

    logger.info("Bulk operations completed", {
      importId,
      adminUid,
      operation: operationType,
      total: users.length,
      success: result.success,
      failed: result.failed,
    });

    return result;
  }

  /**
   * Process bulk creates - Creates leads + Firebase users + MongoDB profiles
   * OPTIMIZED: Uses bulk duplicate checks to minimize database queries and API calls
   */
  private static async processCreates(
    users: ParsedUser[],
    importId: string,
    adminUid: string
  ): Promise<{
    success: number;
    failed: number;
    leadIds: string[];
    userIds: string[];
    errors: Array<{ row: number; uid?: string; phone?: string; error: string }>;
  }> {
    const processingResult = {
      success: 0,
      failed: 0,
      leadIds: [] as string[],
      userIds: [] as string[],
      errors: [] as Array<{
        row: number;
        uid?: string;
        phone?: string;
        error: string;
      }>,
    };

    logger.info(
      `Processing ${users.length} creates (leads + Firebase + profiles) from bulk upload`
    );

    // STEP 1: Bulk duplicate check - Check ALL phones at once (single MongoDB query)
    const allPhoneNumbers = users.map((user) => user.phone!).filter(Boolean);
    const normalizedPhoneNumbers = allPhoneNumbers.map((phone) =>
      DuplicateCheckService.normalizePhone(phone)
    );

    logger.info(
      `Performing bulk duplicate check for ${normalizedPhoneNumbers.length} phone numbers`
    );
    const existingLeadsByPhoneMap = await DuplicateCheckService.checkPhonesBulk(
      allPhoneNumbers
    );

    const existingProfilePhonesSet = new Set<string>();

    // STEP 3: Filter out duplicates before processing
    interface UserToProcess {
      user: ParsedUser;
      originalIndex: number;
      csvRowNumber: number;
    }

    const usersToProcess: UserToProcess[] = [];
    const duplicateErrors: Array<{
      row: number;
      phone?: string;
      error: string;
    }> = [];

    users.forEach((user, index) => {
      const csvRowNumber = index + 2; // +2 for header row and 0-index
      const normalizedPhone = DuplicateCheckService.normalizePhone(user.phone!);
      const formattedPhoneForApi = UserCreationService.formatPhone(user.phone!);

      // Check if lead already exists
      if (existingLeadsByPhoneMap.has(normalizedPhone)) {
        const existingLead = existingLeadsByPhoneMap.get(normalizedPhone);
        duplicateErrors.push({
          row: csvRowNumber,
          phone: user.phone,
          error: `Duplicate lead found: ${
            existingLead?.leadId || "existing lead"
          }`,
        });
        logger.debug(`Skipping duplicate lead`, {
          row: csvRowNumber,
          phone: normalizedPhone,
          existingLeadId: existingLead?.leadId,
        });
        return;
      }

      // Check if profile already exists (if we have bulk check data)
      if (existingProfilePhonesSet.has(formattedPhoneForApi)) {
        duplicateErrors.push({
          row: csvRowNumber,
          phone: user.phone,
          error: `User profile already exists with phone number ${formattedPhoneForApi}`,
        });
        logger.debug(`Skipping duplicate profile`, {
          row: csvRowNumber,
          phone: formattedPhoneForApi,
        });
        return;
      }

      // User passed duplicate checks, add to processing queue
      usersToProcess.push({
        user,
        originalIndex: index,
        csvRowNumber,
      });
    });

    // Add duplicate errors to result
    duplicateErrors.forEach((duplicateError) => {
      processingResult.failed++;
      processingResult.errors.push(duplicateError);
    });

    logger.info(
      `Duplicate filtering completed: ${duplicateErrors.length} duplicates found, ${usersToProcess.length} users to process`
    );

    if (usersToProcess.length === 0) {
      logger.warn("No users to process after duplicate filtering");
      return processingResult;
    }

    // STEP 4: Process remaining users in batches (for Firebase rate limits)
    const FIREBASE_BATCH_SIZE = 10;
    const processingBatches: UserToProcess[][] = [];

    for (let i = 0; i < usersToProcess.length; i += FIREBASE_BATCH_SIZE) {
      processingBatches.push(usersToProcess.slice(i, i + FIREBASE_BATCH_SIZE));
    }

    for (
      let batchIndex = 0;
      batchIndex < processingBatches.length;
      batchIndex++
    ) {
      const currentBatch = processingBatches[batchIndex];
      const batchStartRow =
        processingBatches
          .slice(0, batchIndex)
          .reduce((sum, batch) => sum + batch.length, 0) + 2;

      try {
        // Step 4a: Create all leads in parallel (no duplicates, safe to parallelize)
        interface LeadCreationResult {
          success: boolean;
          lead?: any;
          userData?: ParsedUser;
          originalIndex?: number;
          csvRowNumber?: number;
          error?: string;
        }

        const leadCreationPromises = currentBatch.map(
          async (userToProcess): Promise<LeadCreationResult> => {
            try {
              const createdLead = await LeadService.createLead({
                name: userToProcess.user.name!,
                phone: userToProcess.user.phone!,
                email: userToProcess.user.email,
                city: userToProcess.user.city || "Unknown",
                state: userToProcess.user.state,
                address: userToProcess.user.address,
                pincode: userToProcess.user.pincode,
                primaryCategory:
                  userToProcess.user.primaryCategory ||
                  userToProcess.user.primarySkill ||
                  "other",
                primarySkill:
                  userToProcess.user.primaryCategory ||
                  userToProcess.user.primarySkill ||
                  "other", // For backward compatibility
                secondaryCategory:
                  userToProcess.user.secondaryCategory ||
                  userToProcess.user.secondarySkill ||
                  "",
                secondarySkill:
                  userToProcess.user.secondaryCategory ||
                  userToProcess.user.secondarySkill ||
                  "", // For backward compatibility
                experienceLevel: (userToProcess.user.experienceLevel ||
                  "intermediate") as
                  | "beginner"
                  | "intermediate"
                  | "experienced",
                workingDays: userToProcess.user.workingDays,
                preferredTimeSlot: userToProcess.user.preferredTimeSlot,
                source: (userToProcess.user.source as any) || "campaign",
                sourceDetails: `Bulk upload: ${importId}`,
                agentCampaignId: userToProcess.user.agentCampaignId,
                addedBy: adminUid,
                addedByName: undefined,
              });

              // Update lead status and creationMethod
              createdLead.status = "account_created";
              createdLead.creationMethod = "bulk_upload";
              createdLead.statusHistory.push({
                status: "account_created",
                changedBy: adminUid,
                changedAt: new Date(),
                notes: "Created via bulk upload",
              });
              await createdLead.save();

              return {
                success: true,
                lead: createdLead,
                userData: userToProcess.user,
                originalIndex: userToProcess.originalIndex,
                csvRowNumber: userToProcess.csvRowNumber,
              };
            } catch (error: any) {
              // Check if error is about duplicate (from LeadService.createLead)
              const isDuplicateError =
                error.message?.includes("Duplicate") ||
                error.message?.includes("duplicate");
              return {
                success: false,
                error: isDuplicateError
                  ? error.message
                  : `Lead creation failed: ${error.message}`,
                csvRowNumber: userToProcess.csvRowNumber,
              };
            }
          }
        );

        const leadCreationResults = await Promise.all(leadCreationPromises);

        // Separate successful and failed lead creations
        const successfulLeadCreations = leadCreationResults.filter(
          (result) => result.success
        ) as Array<{
          success: true;
          lead: any;
          userData: ParsedUser;
          originalIndex: number;
          csvRowNumber: number;
        }>;

        const failedLeadCreations = leadCreationResults.filter(
          (result) => !result.success
        ) as Array<{
          success: false;
          error: string;
          csvRowNumber: number;
        }>;

        // Track failed lead creations
        failedLeadCreations.forEach((failedCreation) => {
          processingResult.failed++;
          processingResult.errors.push({
            row: failedCreation.csvRowNumber,
            phone: currentBatch.find(
              (u) => u.csvRowNumber === failedCreation.csvRowNumber
            )?.user.phone,
            error: failedCreation.error,
          });
        });

        // Step 4b: Create Firebase users for successfully created leads
        if (successfulLeadCreations.length > 0) {
          interface FirebaseUserCreationData {
            email: string;
            password: string;
            displayName: string;
            phoneNumber: string;
            emailVerified: boolean;
            disabled: boolean;
          }

          const firebaseUsersToCreate: FirebaseUserCreationData[] =
            successfulLeadCreations.map((leadCreation, index) => {
              const phoneDigitsOnly = leadCreation.userData.phone!.replace(
                /\D/g,
                ""
              );
              const timestamp = Date.now();
              const temporaryEmail =
                leadCreation.userData.email ||
                `helper_${phoneDigitsOnly}_${timestamp}_${index}@extrahand.temp`;

              return {
                email: temporaryEmail,
                password: UserCreationService.generateTempPassword(),
                displayName: leadCreation.userData.name!,
                phoneNumber: UserCreationService.formatPhone(
                  leadCreation.userData.phone!
                ),
                emailVerified: false,
                disabled: false,
              };
            });

          logger.info(
            `Creating ${firebaseUsersToCreate.length} Firebase users in batch ${
              batchIndex + 1
            }`
          );
          const firebaseCreationResult =
            await UserCreationService.createUsersBulk(firebaseUsersToCreate);

          // Step 4c: Map successfully created Firebase users to their leads
          interface LeadFirebasePair {
            lead: any;
            userData: ParsedUser;
            firebaseUid: string;
            originalIndex: number;
            csvRowNumber: number;
          }

          const leadFirebasePairs: LeadFirebasePair[] = [];

          firebaseCreationResult.users.forEach(
            (createdFirebaseUser, firebaseIndex) => {
              const correspondingLeadCreation =
                successfulLeadCreations[firebaseIndex];
              if (correspondingLeadCreation) {
                leadFirebasePairs.push({
                  lead: correspondingLeadCreation.lead,
                  userData: correspondingLeadCreation.userData,
                  firebaseUid: createdFirebaseUser.uid,
                  originalIndex: correspondingLeadCreation.originalIndex,
                  csvRowNumber: correspondingLeadCreation.csvRowNumber,
                });
              }
            }
          );

          // Handle Firebase creation errors
          if (
            firebaseCreationResult.errors &&
            firebaseCreationResult.errors.length > 0
          ) {
            firebaseCreationResult.errors.forEach((firebaseError) => {
              const correspondingLeadCreation =
                successfulLeadCreations[firebaseError.index];
              if (correspondingLeadCreation) {
                processingResult.failed++;
                processingResult.errors.push({
                  row: correspondingLeadCreation.csvRowNumber,
                  phone: correspondingLeadCreation.userData.phone,
                  error: `Firebase creation failed: ${firebaseError.error.message}`,
                });
              }
            });
          }

          // Step 4d: Create MongoDB profiles for successful Firebase users
          if (leadFirebasePairs.length > 0) {
            logger.info(
              `Creating ${leadFirebasePairs.length} MongoDB profiles in batch ${
                batchIndex + 1
              }`
            );

            const profileDocumentsToCreate = leadFirebasePairs.map((pair) => {
              const profileDocument =
                UserCreationService.prepareProfileDocument(
                  pair.firebaseUid,
                  pair.userData,
                  {
                    isAdminVerified: true,
                    phoneVerified: false,
                  }
                );
              profileDocument._userData = pair.userData;
              return profileDocument;
            });

            const profileCreationResult =
              await UserCreationService.createProfilesBulk(
                profileDocumentsToCreate
              );

            // Step 4e: Update leads with activationData and track final results
            for (const leadFirebasePair of leadFirebasePairs) {
              const wasProfileCreated = profileCreationResult.success.includes(
                leadFirebasePair.firebaseUid
              );

              if (wasProfileCreated) {
                // Update lead with activationData
                leadFirebasePair.lead.activationData = {
                  activatedAt: new Date(),
                  firebaseUid: leadFirebasePair.firebaseUid,
                  profileCreated: true,
                };
                leadFirebasePair.lead.statusHistory.push({
                  status: "account_created",
                  changedBy: adminUid,
                  changedAt: new Date(),
                  notes: "Firebase account and profile created via bulk upload",
                });
                await leadFirebasePair.lead.save();

                processingResult.success++;
                processingResult.leadIds.push(leadFirebasePair.lead.leadId);
                processingResult.userIds.push(leadFirebasePair.firebaseUid);

                logger.debug(`Successfully created complete account`, {
                  leadId: leadFirebasePair.lead.leadId,
                  firebaseUid: leadFirebasePair.firebaseUid,
                  name: leadFirebasePair.userData.name,
                });
              } else {
                // Profile creation failed, but Firebase user exists
                const profileCreationError = profileCreationResult.failed.find(
                  (failed) => failed.uid === leadFirebasePair.firebaseUid
                );
                processingResult.failed++;
                processingResult.errors.push({
                  row: leadFirebasePair.csvRowNumber,
                  phone: leadFirebasePair.userData.phone,
                  error: `Profile creation failed: ${
                    profileCreationError?.error || "Unknown error"
                  }`,
                });
              }
            }

            // Handle profile creation failures
            profileCreationResult.failed.forEach((failedProfile) => {
              const correspondingPair = leadFirebasePairs.find(
                (pair) => pair.firebaseUid === failedProfile.uid
              );
              if (correspondingPair) {
                processingResult.failed++;
                processingResult.errors.push({
                  row: correspondingPair.csvRowNumber,
                  phone: correspondingPair.userData.phone,
                  error: `Profile creation failed: ${failedProfile.error}`,
                });
              }
            });
          }
        }
      } catch (batchError: any) {
        logger.error(`Batch ${batchIndex + 1} processing failed:`, batchError);
        currentBatch.forEach((userToProcess) => {
          processingResult.failed++;
          processingResult.errors.push({
            row: userToProcess.csvRowNumber,
            phone: userToProcess.user.phone,
            error: batchError.message || "Batch processing failed",
          });
        });
      }
    }

    logger.info("Bulk creation completed", {
      totalUsers: users.length,
      duplicatesFound: duplicateErrors.length,
      usersProcessed: usersToProcess.length,
      successfulCreations: processingResult.success,
      failedCreations: processingResult.failed,
      leadsCreated: processingResult.leadIds.length,
      firebaseUsersCreated: processingResult.userIds.length,
    });

    return processingResult;
  }

  /**
   * Process bulk updates
   */
  private static async processUpdates(
    users: ParsedUser[],
    importId: string
  ): Promise<{
    success: number;
    failed: number;
    userIds: string[];
    errors: Array<{ row: number; uid?: string; error: string }>;
  }> {
    const result = {
      success: 0,
      failed: 0,
      userIds: [] as string[],
      errors: [] as Array<{ row: number; uid?: string; error: string }>,
    };

    // Process in batches of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const startRow = i + 2;

      try {
        // Update Firebase users in parallel
        const firebaseUpdates = await Promise.allSettled(
          batch.map((user) => {
            const updateData: any = {};
            if (user.name) updateData.displayName = user.name;
            if (user.phone)
              updateData.phoneNumber = UserCreationService.formatPhone(
                user.phone
              );
            return UserCreationService.updateFirebaseUser(
              user.uid!,
              updateData
            );
          })
        );

        // Prepare profile updates
        const profileUpdates = batch
          .map((user, index) => {
            if (firebaseUpdates[index].status === "fulfilled") {
              return UserCreationService.prepareProfileUpdate(user);
            }
            return null;
          })
          .filter(Boolean) as Array<{ uid: string; updatePayload: any }>;

        // Bulk update profiles
        if (profileUpdates.length > 0) {
          await UserCreationService.bulkUpdateProfiles(profileUpdates);
          result.success += profileUpdates.length;
          result.userIds.push(...profileUpdates.map((u) => u.uid));
        }

        // Handle errors
        firebaseUpdates.forEach((settled, index) => {
          if (settled.status === "rejected") {
            result.failed++;
            result.errors.push({
              row: startRow + index,
              uid: batch[index].uid,
              error: settled.reason?.message || "Update failed",
            });
          }
        });
      } catch (error: any) {
        logger.error(`Update batch failed:`, error);
        batch.forEach((user, index) => {
          result.failed++;
          result.errors.push({
            row: startRow + index,
            uid: user.uid,
            error: error.message || "Batch update failed",
          });
        });
      }
    }

    return result;
  }

  /**
   * Process bulk deletes
   */
  private static async processDeletes(
    users: ParsedUser[],
    importId: string
  ): Promise<{
    success: number;
    failed: number;
    userIds: string[];
    errors: Array<{ row: number; uid?: string; error: string }>;
  }> {
    const result = {
      success: 0,
      failed: 0,
      userIds: [] as string[],
      errors: [] as Array<{ row: number; uid?: string; error: string }>,
    };

    // Process in batches of 1000 (Firebase limit)
    const BATCH_SIZE = 1000;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const uids = batch.map((u) => u.uid!).filter(Boolean);
      const startRow = i + 2;

      try {
        // Bulk delete Firebase users
        const firebaseResult = await UserCreationService.deleteUsersBulk(uids);

        // Track successful deletes
        result.success += firebaseResult.successCount;
        result.userIds.push(...firebaseResult.deletedUids);

        // Bulk delete profiles
        if (firebaseResult.deletedUids.length > 0) {
          await UserCreationService.bulkDeleteProfiles(
            firebaseResult.deletedUids
          );
        }

        // Handle errors
        if (firebaseResult.errors && firebaseResult.errors.length > 0) {
          firebaseResult.errors.forEach((error: any) => {
            result.failed++;
            const originalIndex = uids.findIndex((uid) => uid === error.uid);
            result.errors.push({
              row: startRow + (originalIndex >= 0 ? originalIndex : 0),
              uid: error.uid,
              error: error.error.message || "Delete failed",
            });
          });
        }
      } catch (error: any) {
        logger.error(`Delete batch failed:`, error);
        batch.forEach((user, index) => {
          result.failed++;
          result.errors.push({
            row: startRow + index,
            uid: user.uid,
            error: error.message || "Batch delete failed",
          });
        });
      }
    }

    return result;
  }

  private static isValidPhone(phone: string): boolean {
    // E.164 format: +[country code][number]
    const cleaned = phone.replace(/\s+/g, "").replace(/-/g, "");
    return /^\+?[1-9]\d{1,14}$/.test(cleaned);
  }
}
