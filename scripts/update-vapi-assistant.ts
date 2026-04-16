// Updates the Vapi assistant to be a policy explainer + claim understanding agent.
// Run: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/update-vapi-assistant.ts

const VAPI_KEY = process.env.VAPI_PRIVATE_KEY;
const ASSISTANT_ID = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
const APP_URL = process.env.APP_URL || 'https://claimsense-production.up.railway.app';
const WEBHOOK_URL = `${APP_URL}/api/vapi/webhook`;

if (!VAPI_KEY || !ASSISTANT_ID) {
  console.error('Missing VAPI_PRIVATE_KEY or NEXT_PUBLIC_VAPI_ASSISTANT_ID');
  process.exit(1);
}

const updatedConfig = {
  name: 'ClaimSense Policy Assistant',
  firstMessage: 'Namaste! I can help you understand your insurance policy, explain a claim decision, or answer any questions about coverage, limits, and exclusions. What would you like to know?',
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
        content: `You are ClaimSense, a friendly voice assistant that helps people UNDERSTAND their health insurance.

YOUR ROLE — you are an explainer, not a form-filler:
1. Answer policy questions — coverage, limits, exclusions, waiting periods, claim requirements
2. Explain claim decisions — why a claim was approved, rejected, or partially approved
3. Guide next steps — what to do after a rejection, how to appeal, what documents to gather
4. Check claim status — look up existing claims and explain what happened

LANGUAGE: Detect the user's language. Respond in Hindi if they speak Hindi, English if English, Hinglish if mixed. Be natural.

STYLE:
- Explain like talking to a friend, not reading a policy document
- Use simple analogies. "Think of the per-claim limit like a budget per visit — Rs 5,000 max."
- When explaining rejections, be empathetic. "I understand that's frustrating. Here's what happened..."
- Keep answers concise for voice — 2-3 sentences, then ask if they want more detail
- Use Indian Rupees, say "rupees" not "INR"

WHAT YOU DON'T DO:
- You do NOT file claims. If asked, say: "For filing a new claim, you can use the upload form on the website. I'm here to help you understand your policy and explain decisions."
- You do NOT make up policy details. Only answer from what the policy search returns.
- You do NOT give medical advice.

EXAMPLES OF GOOD INTERACTIONS:
User: "Is Ayurveda covered?"
You: "Yes! Ayurvedic treatments are covered under alternative medicine with a sub-limit of Rs 8,000 per year. Covered treatments include Panchakarma, Yoga therapy, and Homeopathy. Want to know about any specific treatment?"

User: "My claim got rejected, why?"
You: "I'd be happy to look into that. Can you tell me your claim ID? It starts with CLM followed by numbers, like CLM_00001."

User: "Mera claim reject ho gaya, kya karun?"
You: "Aapka claim ID bataiye, main check karta hoon ki reject kyun hua. Phir main aapko bataunga ki aap appeal kaise kar sakte hain."`,
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'ask_policy_question',
          description: 'Search the insurance policy knowledge base to answer questions about coverage, limits, exclusions, waiting periods, claim requirements, network hospitals, etc.',
          parameters: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The policy question to search for' },
            },
            required: ['question'],
          },
        },
        server: { url: WEBHOOK_URL },
        messages: [
          { type: 'request-start', content: 'Let me check the policy for that.' },
          { type: 'request-failed', content: 'Sorry, I could not look that up right now. Could you try asking in a different way?' },
        ],
      },
      {
        type: 'function',
        function: {
          name: 'check_claim_status',
          description: 'Look up an existing claim by its ID to check status, amount, and decision details. Claim IDs look like CLM_00001.',
          parameters: {
            type: 'object',
            properties: {
              claim_id: { type: 'string', description: 'The claim ID, like CLM_00001' },
            },
            required: ['claim_id'],
          },
        },
        server: { url: WEBHOOK_URL },
        messages: [
          { type: 'request-start', content: 'Let me look up that claim for you.' },
        ],
      },
      {
        type: 'function',
        function: {
          name: 'list_my_claims',
          description: 'List all claims for a member by their employee/member ID.',
          parameters: {
            type: 'object',
            properties: {
              employee_id: { type: 'string', description: 'Employee or member ID like EMP001' },
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

async function updateAssistant() {
  console.log(`Updating assistant ${ASSISTANT_ID}...`);

  const res = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${VAPI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updatedConfig),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Failed: ${res.status} ${err}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log('✅ Assistant updated!');
  console.log(`   Name: ${data.name}`);
  console.log(`   Role: Policy explainer + claim understanding`);
  console.log(`   Tools: ask_policy_question, check_claim_status, list_my_claims`);
  console.log(`   Removed: file_claim (voice is bad at structured data entry)`);
}

updateAssistant().catch(console.error);
