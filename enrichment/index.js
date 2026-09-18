const Anthropic = require('@anthropic-ai/sdk');

const MODEL_ID = 'claude-sonnet-4-6';
const MAX_MESSAGE_LENGTH = 300;

const SYSTEM_PROMPT = `You write short, personalized LinkedIn connection request messages on behalf of someone reaching out to a potential lead. Rules:
- Under 300 characters total (LinkedIn's connection note limit) -- this is a hard limit, not a suggestion.
- Reference something specific from their post so it doesn't read as generic or templated.
- Briefly mention what we can help with, based on what they appear to need.
- End with a soft, low-pressure call-to-action inviting a short call -- never pushy or salesy.
- Sound like a real person reaching out, not an ad or a template.
- Output ONLY the message text itself. No preamble, no quotation marks, no labels, no character count.`;

function buildUserPrompt(lead) {
  return `Their LinkedIn post: "${lead.postText}"\n\nWhat they appear to need: ${lead.needSummary || 'not specified'}\n\nWrite the connection request message.`;
}

async function generateConnectionMessage(lead) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set, skipping connection message generation');
    return '';
  }
  if (!lead.hasIntentSignal || !lead.postText) {
    return '';
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(lead) }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const message = (textBlock && textBlock.text || '').trim();
    if (!message) return '';

    return message.length > MAX_MESSAGE_LENGTH
      ? `${message.slice(0, MAX_MESSAGE_LENGTH - 3)}...`
      : message;
  } catch (err) {
    console.error(`Connection message generation failed for "${lead.profileUrl}": ${err.message}`);
    return '';
  }
}

async function generateConnectionMessages(leads) {
  const results = [];
  for (const lead of leads) {
    const connectionMessage = await generateConnectionMessage(lead);
    results.push({ ...lead, connectionMessage });
  }
  return results;
}

module.exports = { generateConnectionMessage, generateConnectionMessages };
