// Creates/updates the Vapi voice assistant via REST API.
// Run: npx tsx scripts/setup-vapi-assistant.ts
// Requires VAPI_PRIVATE_KEY and APP_URL in .env.local

import 'dotenv/config';

const VAPI_KEY = process.env.VAPI_PRIVATE_KEY;
const APP_URL = process.env.APP_URL || 'https://claimsense-production.up.railway.app';

if (!VAPI_KEY) {
  console.error('Missing VAPI_PRIVATE_KEY in .env.local');
  process.exit(1);
}

const WEBHOOK_URL = `${APP_URL}/api/vapi/webhook`;

const assistantConfig = {
  name: 'ClaimSense Voice Agent',
  firstMessage: 'Namaste! I am your ClaimSense insurance assistant. I can help you file a new claim, check your claim status, or answer questions about your policy. How can I help you today?',
  firstMessageMode: 'assistant-speaks-first',
  transcriber: {
    provider: 'deepgram',
    model: 'nova-2',
    language: 'multi',
  },
  model: {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are ClaimSense, a friendly and professional voice assistant for an OPD health insurance claims system in India.

You help users:
1. File new insurance claims by collecting required details
2. Check status of existing claims
3. Answer questions about their insurance policy (coverage, limits, exclusions, waiting periods)
4. List their existing claims

LANGUAGE: Detect which language the user speaks. If Hindi, respond in Hindi. If English, respond in English. If Hinglish (mixed), respond in Hinglish. Be natural and conversational.

FILING A CLAIM - collect these details step by step:
- Patient name
- Employee/Member ID (like EMP001)
- Diagnosis (what condition/treatment)
- Treatment type (consultation, dental, diagnostic, pharmacy, alternative_medicine)
- Hospital name (if applicable)
- Bill amount in rupees
- Doctor name
- Doctor registration number (format: StateCode/Number/Year like KA/45678/2015)
- Whether it was a cashless visit

Do NOT ask for all fields at once. Ask 2-3 at a time naturally. If they don't know something (like doctor registration), that's okay - proceed without it.

AMOUNTS: Always speak amounts in Indian Rupees. Say "rupees" not "INR".

TONE: Empathetic, professional, but warm. Insurance claims can be stressful - be reassuring.`,
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'file_claim',
          description: 'Submit a new insurance claim after collecting all required details from the user.',
          parameters: {
            type: 'object',
            properties: {
              patient_name: { type: 'string', description: 'Full name of the patient' },
              employee_id: { type: 'string', description: 'Employee or member ID like EMP001' },
              diagnosis: { type: 'string', description: 'Medical diagnosis or condition' },
              treatment_type: { type: 'string', enum: ['consultation', 'dental', 'diagnostic', 'pharmacy', 'alternative_medicine', 'vision', 'other'], description: 'Category of treatment' },
              hospital_name: { type: 'string', description: 'Name of hospital or clinic' },
              bill_amount: { type: 'number', description: 'Total bill amount in INR' },
              treatment_date: { type: 'string', description: 'Date of treatment in YYYY-MM-DD format' },
              doctor_name: { type: 'string', description: 'Name of the treating doctor' },
              doctor_registration: { type: 'string', description: 'Doctor registration number' },
              cashless: { type: 'boolean', description: 'Whether this was a cashless claim at a network hospital' },
            },
            required: ['patient_name', 'employee_id', 'diagnosis', 'treatment_type', 'bill_amount'],
          },
        },
        server: { url: WEBHOOK_URL },
        messages: [
          { type: 'request-start', content: 'Let me process your claim now. This may take a few seconds.' },
          { type: 'request-failed', content: 'I am sorry, there was an issue processing your claim. Please try again.' },
        ],
      },
      {
        type: 'function',
        function: {
          name: 'check_claim_status',
          description: 'Check the status of an existing claim by claim ID.',
          parameters: {
            type: 'object',
            properties: {
              claim_id: { type: 'string', description: 'The claim ID like CLM_00001' },
            },
            required: ['claim_id'],
          },
        },
        server: { url: WEBHOOK_URL },
      },
      {
        type: 'function',
        function: {
          name: 'ask_policy_question',
          description: 'Answer a question about the insurance policy - coverage, limits, exclusions, waiting periods, claim requirements, etc.',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The policy question to answer' },
            },
            required: ['question'],
          },
        },
        server: { url: WEBHOOK_URL },
      },
      {
        type: 'function',
        function: {
          name: 'list_my_claims',
          description: 'List all claims for a specific member/employee.',
          parameters: {
            type: 'object',
            properties: {
              employee_id: { type: 'string', description: 'Employee or member ID' },
            },
            required: ['employee_id'],
          },
        },
        server: { url: WEBHOOK_URL },
      },
    ],
  },
  voice: {
    provider: 'azure',
    voiceId: 'hi-IN-SwaraNeural',
  },
  serverUrl: WEBHOOK_URL,
  serverMessages: ['tool-calls', 'end-of-call-report'],
};

async function createAssistant() {
  console.log('Creating Vapi assistant...');
  console.log(`Webhook URL: ${WEBHOOK_URL}`);

  const response = await fetch('https://api.vapi.ai/assistant', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VAPI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(assistantConfig),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to create assistant: ${response.status} ${error}`);
    process.exit(1);
  }

  const assistant = await response.json();
  console.log('\n✅ Assistant created successfully!');
  console.log(`   ID: ${assistant.id}`);
  console.log(`   Name: ${assistant.name}`);
  console.log(`\nAdd this to your .env.local:`);
  console.log(`NEXT_PUBLIC_VAPI_ASSISTANT_ID=${assistant.id}`);
  console.log(`NEXT_PUBLIC_VAPI_PUBLIC_KEY=${process.env.VAPI_PUBLIC_KEY || 'your-public-key'}`);
}

createAssistant().catch(console.error);
