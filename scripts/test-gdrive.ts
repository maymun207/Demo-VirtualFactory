/**
 * Quick test script to verify Google Drive access for CWF knowledge base.
 * Run with: npx tsx scripts/test-gdrive.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { google } from 'googleapis';

// Manually load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim();
    process.env[key] = val;
}

const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';

async function testDriveAccess() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
    const folderId = (process.env.CWF_KNOWLEDGE_FOLDER_ID ?? '').trim();

    console.log('=== Google Drive Access Test ===\n');
    console.log(`Service Account: ${email}`);
    console.log(`Folder ID: ${folderId}`);
    console.log(`Private Key: ${key ? '✅ present (' + key.length + ' chars)' : '❌ MISSING'}\n`);

    if (!email || !key || !folderId) {
        console.error('❌ Missing env vars. Check .env.local');
        process.exit(1);
    }

    try {
        const auth = new google.auth.GoogleAuth({
            credentials: { client_email: email, private_key: key },
            scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        });

        const drive = google.drive({ version: 'v3', auth });

        console.log('Step 1: Listing Google Docs in folder...');
        const listRes = await drive.files.list({
            q: `'${folderId}' in parents and mimeType = '${GOOGLE_DOC_MIME_TYPE}' and trashed = false`,
            fields: 'files(id, name, modifiedTime)',
            orderBy: 'name',
            pageSize: 50,
        });

        const files = listRes.data.files ?? [];
        console.log(`✅ Found ${files.length} Google Doc(s):\n`);

        for (const file of files) {
            console.log(`  📄 "${file.name}" (ID: ${file.id})`);

            try {
                const exportRes = await drive.files.export({
                    fileId: file.id!,
                    mimeType: 'text/plain',
                });
                const content = (exportRes.data as string) ?? '';
                const preview = content.trim().substring(0, 200);
                console.log(`     ✅ Content loaded (${content.length} chars)`);
                console.log(`     Preview: "${preview}..."\n`);
            } catch (err) {
                console.log(`     ❌ Failed to export: ${(err as Error).message}\n`);
            }
        }

        if (files.length === 0) {
            console.log('  ⚠️  No Google Docs found. Make sure you have Google Docs (not .docx uploads) in the folder.');
        }

        console.log('\n=== Test Complete ===');
    } catch (err) {
        console.error(`\n❌ Drive API error: ${(err as Error).message}`);
        process.exit(1);
    }
}

testDriveAccess();
