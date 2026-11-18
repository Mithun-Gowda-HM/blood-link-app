require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, "data.json");
const GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const CAN_DONATE_TO = {
  "A+": ["A+", "AB+"], "A-": ["A+", "A-", "AB+", "AB-"],
  "B+": ["B+", "AB+"], "B-": ["B+", "B-", "AB+", "AB-"],
  "AB+": ["AB+"], "AB-": ["AB+", "AB-"],
  "O+": ["O+", "A+", "B+", "AB+"], "O-": GROUPS
};
app.use(express.json({limit:"100kb"}));
app.use(express.static(path.join(__dirname,"public")));

const blank = { users: [], requests: [], responses: [], notifications: [] };
function read() {
  try {
    if (!fs.existsSync(DB)) fs.writeFileSync(DB, JSON.stringify(blank,null,2));
    return JSON.parse(fs.readFileSync(DB,"utf8"));
  } catch { return JSON.parse(JSON.stringify(blank)); }
}
function write(data) { fs.writeFileSync(DB,JSON.stringify(data,null,2)); }
const clean = v => String(v ?? "").trim();
const id = prefix => `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
const emailOn = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

async function mail(to, subject, text) {
  if (!emailOn() || !to) return false;
  const transporter = nodemailer.createTransport({
    host:process.env.SMTP_HOST, port:Number(process.env.SMTP_PORT || 587),
    secure:String(process.env.SMTP_SECURE).toLowerCase()==="true",
    auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}
  });
  await transporter.sendMail({from:process.env.MAIL_FROM || process.env.SMTP_USER,to,subject,text});
  return true;
}
function publicUser(u) {
  return {id:u.id,name:u.name,role:u.role,bloodGroup:u.bloodGroup,city:u.city,area:u.area,
    available:u.available,phone:u.phone,email:u.email};
}
function matchesFor(db, request) {
  return db.users.filter(u => u.role==="donor" && u.available &&
    CAN_DONATE_TO[u.bloodGroup]?.includes(request.bloodGroup) &&
    u.city.toLowerCase()===request.city.toLowerCase());
}
app.get("/api/health",(req,res)=>res.json({status:"ok",app:"Blood Link"}));

app.post("/api/users", (req,res)=>{
  const role=clean(req.body.role);
  const name=clean(req.body.name), email=clean(req.body.email).toLowerCase();
  const phone=clean(req.body.phone), city=clean(req.body.city), area=clean(req.body.area);
  const bloodGroup=clean(req.body.bloodGroup).toUpperCase();
  if(!["donor","receiver"].includes(role)||!name||!email||!phone||!city||
     !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({error:"Please complete all required profile fields with a valid email."});
  if(role==="donor" && (!GROUPS.includes(bloodGroup)||Number(req.body.age)<18||Number(req.body.age)>100))
    return res.status(400).json({error:"Donors must select a valid blood group and be aged 18 or older."});
  const db=read();
  const existing=db.users.find(u=>u.email===email && u.role===role);
  if(existing) return res.json({user:publicUser(existing),existing:true});
  const user={id:id("U"),role,name,email,phone,city,area,bloodGroup:role==="donor"?bloodGroup:null,
    age:role==="donor"?Number(req.body.age):null,available:role==="donor"?req.body.available!==false:false,
    consent:req.body.consent===true,createdAt:new Date().toISOString()};
  if(!user.consent) return res.status(400).json({error:"Please agree to the privacy and notification consent."});
  db.users.push(user); write(db);
  res.status(201).json({user:publicUser(user),existing:false});
});

app.get("/api/users/:userId",(req,res)=>{
  const u=read().users.find(x=>x.id===req.params.userId);
  if(!u) return res.status(404).json({error:"Profile not found."});
  res.json({user:publicUser(u)});
});
app.patch("/api/users/:userId",(req,res)=>{
  const db=read(), u=db.users.find(x=>x.id===req.params.userId);
  if(!u) return res.status(404).json({error:"Profile not found."});
  if(u.role!=="donor") return res.status(403).json({error:"Only donor availability can be changed here."});
  u.available=Boolean(req.body.available); write(db);
  res.json({user:publicUser(u)});
});
app.get("/api/dashboard/:userId",(req,res)=>{
  const db=read(), u=db.users.find(x=>x.id===req.params.userId);
  if(!u) return res.status(404).json({error:"Profile not found."});
  if(u.role==="donor"){
    const available=matchesFor(db,{bloodGroup:u.bloodGroup,city:u.city});
    // Requests compatible with this donor's blood group, not merely the donor's own group.
    const requests=db.requests.filter(r=>r.status==="Open" &&
      CAN_DONATE_TO[u.bloodGroup]?.includes(r.bloodGroup) &&
      r.city.toLowerCase()===u.city.toLowerCase());
    const responded=db.responses.filter(r=>r.donorId===u.id);
    res.json({role:"donor",user:publicUser(u),matches:requests.map(r=>({
      ...r, requesterPhone:undefined, interested:responded.some(x=>x.requestId===r.id)
    })),agenda:responded.map(x=>({type:"response",title:"You responded to a blood request",date:x.createdAt,status:x.status}))});
  } else {
    const own=db.requests.filter(r=>r.receiverId===u.id).map(r=>({
      ...r, interestedDonors:db.responses.filter(x=>x.requestId===r.id).length,
      responses:db.responses.filter(x=>x.requestId===r.id).map(x=>{
        const donor=db.users.find(d=>d.id===x.donorId);
        return {name:donor?.name || "Donor",bloodGroup:donor?.bloodGroup,city:donor?.city,phone:donor?.phone,status:x.status};
      })
    }));
    res.json({role:"receiver",user:publicUser(u),requests:own,agenda:own.map(r=>({type:"request",title:`${r.bloodGroup} request at ${r.hospital}`,date:r.createdAt,status:r.status}))});
  }
});

app.post("/api/requests",(req,res)=>{
  const db=read(), receiver=db.users.find(u=>u.id===clean(req.body.receiverId)&&u.role==="receiver");
  const bloodGroup=clean(req.body.bloodGroup).toUpperCase(), city=clean(req.body.city);
  const hospital=clean(req.body.hospital), area=clean(req.body.area);
  const units=Number(req.body.units), urgency=clean(req.body.urgency)||"Urgent";
  if(!receiver) return res.status(401).json({error:"Please sign in with a receiver profile first."});
  if(!GROUPS.includes(bloodGroup)||!city||!hospital||!Number.isInteger(units)||units<1||units>20)
    return res.status(400).json({error:"Please complete the request details."});
  const request={id:id("R"),receiverId:receiver.id,bloodGroup,city,area,hospital,units,urgency,
    status:"Open",createdAt:new Date().toISOString()};
  db.requests.push(request);
  const donors=matchesFor(db,request);
  db.notifications.push(...donors.map(d=>({id:id("N"),userId:d.id,requestId:request.id,
    type:"matching_request",read:false,createdAt:new Date().toISOString()})));
  write(db);
  // Optional email is best-effort; in-app matching is available without SMTP.
  (async()=>{for(const d of donors){try{await mail(d.email,"Blood Link: matching blood request",
    `Hello ${d.name}, a ${bloodGroup} blood request has been posted in ${city} at ${hospital}. `+
    `Please open Blood Link to review it. Only respond if you are willing and medically eligible. `+
    `A blood bank or clinician must confirm compatibility and eligibility.`);}catch(e){console.error("Email alert:",e.message);}}})();
  res.status(201).json({message:"Request created and matching donors notified in the app.",requestId:request.id,matchedDonors:donors.length,emailConfigured:emailOn()});
});

app.post("/api/requests/:requestId/respond",(req,res)=>{
  const db=read(), donor=db.users.find(u=>u.id===clean(req.body.donorId)&&u.role==="donor");
  const request=db.requests.find(r=>r.id===req.params.requestId&&r.status==="Open");
  if(!donor) return res.status(401).json({error:"Donor profile not found."});
  if(!request) return res.status(404).json({error:"This request is no longer open."});
  if(!donor.available) return res.status(400).json({error:"Please turn on your donor availability before responding."});
  if(!CAN_DONATE_TO[donor.bloodGroup]?.includes(request.bloodGroup)||
     donor.city.toLowerCase()!==request.city.toLowerCase())
    return res.status(403).json({error:"This request does not match your blood group and city."});
  if(db.responses.some(x=>x.requestId===request.id&&x.donorId===donor.id))
    return res.status(409).json({error:"You have already responded to this request."});
  db.responses.push({id:id("P"),requestId:request.id,donorId:donor.id,status:"Interested",createdAt:new Date().toISOString()});
  db.notifications.push({id:id("N"),userId:request.receiverId,requestId:request.id,type:"donor_interest",read:false,createdAt:new Date().toISOString()});
  write(db);
  const receiver=db.users.find(u=>u.id===request.receiverId);
  if(receiver?.email) mail(receiver.email,"Blood Link: a donor responded",`${donor.name} is interested in your ${request.bloodGroup} request. Please open Blood Link to view contact details.`).catch(()=>{});
  res.json({message:"Your response has been shared with the receiver."});
});

app.patch("/api/requests/:requestId/status",(req,res)=>{
  const db=read(), request=db.requests.find(r=>r.id===req.params.requestId);
  if(!request) return res.status(404).json({error:"Request not found."});
  if(request.receiverId!==clean(req.body.receiverId)) return res.status(403).json({error:"Only the receiver who created this request can update it."});
  if(!["Open","Fulfilled","Cancelled"].includes(req.body.status)) return res.status(400).json({error:"Invalid status."});
  request.status=req.body.status; write(db); res.json({request});
});

app.get("/api/notifications/:userId",(req,res)=>{
  const db=read();
  res.json(db.notifications.filter(n=>n.userId===req.params.userId).slice(-30).reverse());
});
app.post("/api/notifications/:userId/read",(req,res)=>{
  const db=read(); db.notifications.forEach(n=>{if(n.userId===req.params.userId)n.read=true;});
  write(db); res.json({ok:true});
});

app.listen(PORT,()=>{read();console.log(`Blood Link is running at http://localhost:${PORT}`);});
