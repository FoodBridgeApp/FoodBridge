import express from "express";
import { Resend } from "resend";
const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY!);

router.post("/send", async (req, res) => {
  try {
    const { to, subject, html } = req.body || {};
    if (!to || !subject || !html) return res.status(400).json({ ok:false, error:"Missing to/subject/html" });
    const { data, error } = await resend.emails.send({
      from: "FoodBridge <noreply@foodbridge.app>",
      to: Array.isArray(to) ? to : [to],
      subject, html
    });
    if (error) return res.status(500).json({ ok:false, error });
    res.json({ ok:true, id: data?.id });
  } catch (e:any) {
    res.status(500).json({ ok:false, error: e?.message || "unknown" });
  }
});
export default router;
