import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import mongoose from 'mongoose';
import { env } from '../src/config/env';
import Lead from '../src/models/Lead';

const clean = (arr: any[]) =>
  [...new Set(arr)]
    .filter((v: any) => v && typeof v === 'string' && v.trim() !== '')
    .sort() as string[];

async function main() {
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGO_DB });
  console.log('Connected to MongoDB\n');

  const [cities, localities, addresses, gatedCommunities, states] = await Promise.all([
    Lead.distinct('city') as Promise<string[]>,
    Lead.distinct('locality') as Promise<string[]>,
    Lead.distinct('address') as Promise<string[]>,
    Lead.distinct('gatedCommunityName') as Promise<string[]>,
    Lead.distinct('state') as Promise<string[]>,
  ]);

  console.log('--- CITY field values ---');
  console.log(clean(cities));

  console.log('\n--- LOCALITY field values ---');
  console.log(clean(localities));

  console.log('\n--- ADDRESS field values ---');
  console.log(clean(addresses));

  console.log('\n--- GATED COMMUNITY field values ---');
  console.log(clean(gatedCommunities));

  console.log('\n--- STATE field values ---');
  console.log(clean(states));

  console.log('\n--- 20 SAMPLE LOCATION COMBINATIONS ---');
  const samples = await Lead.find(
    { city: { $exists: true, $ne: '' } },
    { city: 1, locality: 1, address: 1, gatedCommunityName: 1, state: 1, _id: 0 }
  ).limit(20).lean();
  console.log(JSON.stringify(samples, null, 2));

  console.log('\n--- FIELD COVERAGE ---');
  const total = await Lead.countDocuments();
  const hasCity = await Lead.countDocuments({ city: { $exists: true, $ne: '' } });
  const hasLocality = await Lead.countDocuments({ locality: { $exists: true, $ne: '' } });
  const hasAddress = await Lead.countDocuments({ address: { $exists: true, $ne: '' } });
  const hasGated = await Lead.countDocuments({ gatedCommunityName: { $exists: true, $ne: '' } });

  console.log(`Total leads: ${total}`);
  console.log(`Has city: ${hasCity}`);
  console.log(`Has locality: ${hasLocality}`);
  console.log(`Has address: ${hasAddress}`);
  console.log(`Has gatedCommunityName: ${hasGated}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
