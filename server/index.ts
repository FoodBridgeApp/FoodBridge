import express from "express";
import bodyParser from "body-parser";
const app = express();
app.use(express.json());
app.use(bodyParser.json());

app.get("/health", (_,res)=>res.json({ok:true}));

import emailPlan from "./routes/emailPlan";
app.use("/api/email", emailPlan);

import prices from "./routes/prices";
app.use("/api/prices", prices);

const port = process.env.PORT || 3001;
app.use("/api/email", emailPlan); app.use("/api/prices", prices); app.listen(port, ()=>console.log(`server on :${port}`));


