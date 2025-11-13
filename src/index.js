import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import cookieParser from "cookie-parser"
import dbConnect from "./config/db.js";
import paymentsRoute from "./route/payments.js";
import dummyCheckoutRoute from "./route/dummyCheckout.js";
import authRoute from "./route/auth.js";
import userRoute from "./route/user.js";
import adminRoute from "./route/admin.js";
import resourcesRoute from "./route/resources.js";
import leadsRoute from "./route/leads.js";
import { startTokenRefreshCron } from "./services/cronJobs.js";
import { seedInitialData } from "./services/seedData.js";


dotenv.config();
const PORT = process.env.PORT || 5000

const app = express();

// Middleware
app.use(cors({ credentials: true, origin: process.env.BASE_URL }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



// Database connection
dbConnect();

// Initialize seed data
seedInitialData();

// Start cron jobs
startTokenRefreshCron();

// Routes
app.get("/",(req,res)=>{
    res.send("ClientSure API is working");
})

app.use("/api/payments", paymentsRoute);
app.use("/api/auth", authRoute);
app.use("/api/user", userRoute);
app.use("/api/admin", adminRoute);
app.use("/api/resources", resourcesRoute);
app.use("/api/leads", leadsRoute);
app.use("/", dummyCheckoutRoute);

app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
    console.log(`Payment endpoint: http://localhost:${PORT}/api/payments/create-order`);
})