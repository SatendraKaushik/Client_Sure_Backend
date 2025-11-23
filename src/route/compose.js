import express from "express";
import Response from "../models/Response.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();

router.post("/", async (req, res) => {
  const { channel, industry, tone, goal, details, language } = req.body;

const prompt = `
You are an expert ${channel} message copywriter.

Write the message in: ${language || "English"}
Industry: ${industry}
Tone style: ${tone}
Primary goal: ${goal}

Context details (optional, use only if helpful):
${JSON.stringify(details || {}, null, 2)}

Your task:
- Write a highly effective, human-sounding ${channel} message.
- Keep it concise (3–4 lines maximum).
- Make it clear, engaging, and goal-driven.
- Maintain the selected tone throughout.
- Do NOT repeat the metadata (industry, tone, goal, etc.) in the output.
- Provide only the final message, no explanation.
`;


  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // ⭐ IMPORTANT: Use ONLY a model your API key supports
    const model = genAI.getGenerativeModel({
      model: "models/gemini-2.5-flash"
    });

    const result = await model.generateContent(prompt);

    const aiText = result.response.text();

    // Save in DB
    await Response.create({
      channel,
      prompt,
      aiText
    });

    res.json({ ok: true, text: aiText });

  } catch (error) {
    console.error("Gemini error:", error);
    res.status(500).json({ ok: false, error: "AI request failed" });
  }
});

export default router;