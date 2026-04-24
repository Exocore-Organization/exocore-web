const OpenAI = require('openai');
const openai = new OpenAI();
(async () => {
  const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hello!' }] });
  console.log(r.choices[0].message.content);
})();
