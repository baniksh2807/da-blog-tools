import { publish, unpublish, daFetch } from '@adobe/da-sdk';

export default async function run(context) {
  const { url, user } = context;

  console.log(`👤 ${user.name} triggered custom publish for: ${url}`);

  // Step 1: Unpublish existing
  await unpublish(url, { fetchImpl: daFetch });

  // Step 2: Move to date-based path before publish (custom rule)
  const datedUrl = await moveToDatePath(url);

  // Step 3: Publish at new location
  const result = await publish(datedUrl, { force: true, fetchImpl: daFetch });

  // Step 4: Notify external system
  await sendWebhook(datedUrl, user);

  return result;
}

async function moveToDatePath(url) {
  // Custom logic to move doc to /YYYY/MM/title.docx
  return url;
}

async function sendWebhook(url, user) {
  console.log(`📢 Notify downstream system: ${url} by ${user.email}`);
}
