import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { AdminRequest, adminAuthMiddleware } from '../middleware/adminAuth';
import { requireRole } from '../middleware/roleAuth';
import WebsiteLead from '../models/WebsiteLead';

const router = Router();

const serviceCategories: Record<string, string> = {
  'hourly-based-services': 'Hourly Based Services',
  'cleaning-services': 'Home Cleaning',
  'home-cleaning': 'Home Cleaning',
  'heating-cooling-services': 'AC Services',
  'ac-repair': 'AC Services',
  'appliances-services': 'Appliance Repair',
  'appliance-repair': 'Appliance Repair',
  'admin-services': 'Personal Assistance',
  'personal-assistance': 'Personal Assistance',
  'pest-control-services': 'Pest Control',
  'pest-control': 'Pest Control',
  'electricians-services': 'Electrician',
  electrician: 'Electrician',
  'plumbing-services': 'Plumbing',
  plumbing: 'Plumbing',
};

router.post('/public', async (req, res) => {
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  const rawMobile =
    typeof req.body.mobileNumber === 'string' ? req.body.mobileNumber.trim() : '';
  const city = typeof req.body.city === 'string' ? req.body.city.trim() : '';
  const serviceCategorySlug =
    typeof req.body.serviceCategorySlug === 'string'
      ? req.body.serviceCategorySlug.trim().toLowerCase()
      : '';
  const mobileDigits = rawMobile.replace(/\D/g, '');

  if (fullName.length < 2 || fullName.length > 80) {
    res.status(400).json({ success: false, error: 'Enter a name between 2 and 80 characters.' });
    return;
  }
  if (!/^(?:[6-9]\d{9}|91[6-9]\d{9})$/.test(mobileDigits)) {
    res.status(400).json({ success: false, error: 'Enter a valid Indian mobile number.' });
    return;
  }
  if (city.length < 2 || city.length > 80) {
    res.status(400).json({ success: false, error: 'Enter a city between 2 and 80 characters.' });
    return;
  }

  const serviceCategory = serviceCategories[serviceCategorySlug];
  if (!serviceCategory) {
    res.status(400).json({ success: false, error: 'Choose a service category.' });
    return;
  }

  try {
    const lead = await WebsiteLead.create({
      fullName,
      mobileNumber: `+91${mobileDigits.slice(-10)}`,
      city,
      serviceCategory,
      serviceCategorySlug,
    });

    res.status(201).json({
      success: true,
      message: 'Thanks for your interest. Our team will be in touch soon.',
      leadId: lead._id,
    });
  } catch (error) {
    console.error('Unable to save website lead:', error);
    res.status(500).json({ success: false, error: 'Unable to submit your enquiry right now.' });
  }
});

router.use(adminAuthMiddleware, requireRole('onboarder', 'lead_access_manager'));

router.get('/', async (req, res: Response) => {
  const requestedPage = Number.parseInt(String(req.query.page || ''), 10);
  const requestedLimit = Number.parseInt(String(req.query.limit || ''), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(100, Math.max(1, requestedLimit))
    : 25;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';
  const filter: Record<string, unknown> = {};

  if (city) filter.city = city;
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');
    filter.$or = [{ fullName: searchRegex }, { mobileNumber: searchRegex }];
  }

  try {
    const [leads, total, totalEnquiries, claimed, cities] = await Promise.all([
      WebsiteLead.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      WebsiteLead.countDocuments(filter),
      WebsiteLead.countDocuments(),
      WebsiteLead.countDocuments({ claimedAt: { $exists: true } }),
      WebsiteLead.distinct('city'),
    ]);

    res.status(200).json({
      success: true,
      data: leads,
      cities: cities.filter(Boolean).sort((a, b) => a.localeCompare(b)),
      summary: {
        total: totalEnquiries,
        claimed,
        unclaimed: totalEnquiries - claimed,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Unable to load website leads:', error);
    res.status(500).json({ success: false, error: 'Unable to load website leads.' });
  }
});

router.post('/:leadId/claim', async (req: AdminRequest, res: Response) => {
  const claimantId = req.admin?.userId || req.admin?.uid;
  if (!claimantId) {
    res.status(401).json({ success: false, error: 'Authenticated user identity is missing.' });
    return;
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.leadId)) {
    res.status(400).json({ success: false, error: 'Invalid website lead ID.' });
    return;
  }

  const claimedByName = req.admin?.name || req.admin?.email || claimantId;
  try {
    const lead = await WebsiteLead.findOneAndUpdate(
      { _id: req.params.leadId, claimedAt: { $exists: false } },
      { $set: { claimedBy: claimantId, claimedByName, claimedAt: new Date() } },
      { new: true, runValidators: true }
    ).lean();

    if (lead) {
      res.status(200).json({ success: true, data: lead });
      return;
    }

    const existingLead = await WebsiteLead.findById(req.params.leadId).lean();
    if (!existingLead) {
      res.status(404).json({ success: false, error: 'Website lead not found.' });
      return;
    }
    if (existingLead.claimedBy === claimantId) {
      res.status(200).json({ success: true, data: existingLead });
      return;
    }

    res.status(409).json({
      success: false,
      error: 'This website lead has already been claimed.',
      data: existingLead,
    });
  } catch (error) {
    console.error('Unable to claim website lead:', error);
    res.status(500).json({ success: false, error: 'Unable to claim this website lead.' });
  }
});

export default router;
