const version = require("./routes/version");
const emailPlan = require("./routes/emailPlan");
const prices = require("./routes/prices");

app.use("/api/prices", prices);
app.use("/api/email", emailPlan);
app.use("/api/version", version);




