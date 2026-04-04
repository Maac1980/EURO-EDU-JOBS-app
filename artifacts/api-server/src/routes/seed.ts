import { Router } from "express";
import { db, schema } from "../db/index.js";
import { sql } from "drizzle-orm";
import { authenticateToken, requireAdmin } from "../lib/authMiddleware.js";

const router = Router();

const SEED_WORKERS = [
  { name:"Dmytro Kovalenko", email:"dmytro.kovalenko@example.com", phone:"+380671234501", jobRole:"Welder TIG", nationality:"Ukrainian", assignedSite:"Wroclaw-Site-A", hourlyNettoRate:38, trcExpiry:"2026-12-15", workPermitExpiry:"2026-08-20", bhpStatus:"2026-09-10", badaniaLekExpiry:"2026-11-01", pipelineStage:"Active" },
  { name:"Olena Shevchuk", email:"olena.shevchuk@example.com", phone:"+380671234502", jobRole:"Healthcare Assistant", nationality:"Ukrainian", assignedSite:"Warsaw-MediCare", hourlyNettoRate:32, trcExpiry:"2026-04-05", workPermitExpiry:"2026-04-10", bhpStatus:"2026-06-15", badaniaLekExpiry:"2026-04-03", pipelineStage:"Screening" },
  { name:"Gheorghe Popescu", email:"gheorghe.popescu@example.com", phone:"+40712345601", jobRole:"Construction Worker", nationality:"Romanian", assignedSite:"Wroclaw-Site-B", hourlyNettoRate:28, trcExpiry:"2026-10-20", workPermitExpiry:"2026-10-25", bhpStatus:"2026-11-30", badaniaLekExpiry:"2026-10-15", pipelineStage:"Active" },
  { name:"Ana-Maria Ionescu", email:"ana-maria.ionescu@example.com", phone:"+40712345602", jobRole:"Quality Inspector", nationality:"Romanian", assignedSite:"Poznan-LogiTrans", hourlyNettoRate:35, trcExpiry:"2026-06-30", workPermitExpiry:"2026-07-01", bhpStatus:"2026-05-20", badaniaLekExpiry:"2026-06-28", pipelineStage:"Active" },
  { name:"Giorgi Beridze", email:"giorgi.beridze@example.com", phone:"+995551234501", jobRole:"Forklift Driver", nationality:"Georgian", assignedSite:"Wroclaw-Site-A", hourlyNettoRate:31, trcExpiry:"2026-09-15", workPermitExpiry:"2026-09-20", bhpStatus:"2026-08-10", badaniaLekExpiry:"2026-09-12", pipelineStage:"Active" },
  { name:"Nino Tsiklauri", email:"nino.tsiklauri@example.com", phone:"+995551234502", jobRole:"HR Coordinator", nationality:"Georgian", assignedSite:"Warsaw-HQ", hourlyNettoRate:42, trcExpiry:"2026-11-30", workPermitExpiry:"2026-12-01", bhpStatus:"2026-10-20", badaniaLekExpiry:"2026-11-25", pipelineStage:"Active" },
  { name:"Rajiv Kumar", email:"rajiv.kumar@example.com", phone:"+919876543201", jobRole:"IT Support", nationality:"Indian", assignedSite:"Warsaw-HQ", hourlyNettoRate:45, trcExpiry:"2026-08-10", workPermitExpiry:"2026-08-15", bhpStatus:"2026-07-20", badaniaLekExpiry:"2026-08-08", pipelineStage:"Active" },
  { name:"Priya Sharma", email:"priya.sharma@example.com", phone:"+919876543202", jobRole:"Nurse", nationality:"Indian", assignedSite:"Warsaw-MediCare", hourlyNettoRate:40, trcExpiry:"2026-04-02", workPermitExpiry:"2026-04-05", bhpStatus:"2026-04-01", badaniaLekExpiry:"2026-04-04", pipelineStage:"Screening" },
  { name:"Nguyen Van Thanh", email:"nguyen.van.thanh@example.com", phone:"+84901234501", jobRole:"Cook", nationality:"Vietnamese", assignedSite:"Warsaw-Restaurant", hourlyNettoRate:27, trcExpiry:"2026-07-15", workPermitExpiry:"2026-07-20", bhpStatus:"2026-06-30", badaniaLekExpiry:"2026-07-10", pipelineStage:"Active" },
  { name:"Le Thi Huong", email:"le.thi.huong@example.com", phone:"+84901234502", jobRole:"Warehouse Operative", nationality:"Vietnamese", assignedSite:"Poznan-LogiTrans", hourlyNettoRate:26, trcExpiry:"2026-09-01", workPermitExpiry:"2026-09-05", bhpStatus:"2026-08-20", badaniaLekExpiry:"2026-08-28", pipelineStage:"Active" },
  { name:"Mohamed Hassan", email:"mohamed.hassan@example.com", phone:"+201012345601", jobRole:"Security Guard", nationality:"Egyptian", assignedSite:"Warsaw-HQ", hourlyNettoRate:29, trcExpiry:"2026-05-10", workPermitExpiry:"2026-04-30", bhpStatus:"2026-06-15", badaniaLekExpiry:"2026-05-08", pipelineStage:"Active" },
  { name:"Fatima El-Sayed", email:"fatima.el-sayed@example.com", phone:"+201012345602", jobRole:"Cleaner", nationality:"Egyptian", assignedSite:"Warsaw-Restaurant", hourlyNettoRate:24, trcExpiry:"2026-08-20", workPermitExpiry:"2026-08-25", bhpStatus:"2026-07-30", badaniaLekExpiry:"2026-08-18", pipelineStage:"Active" },
  { name:"Piotr Nowak", email:"piotr.nowak@example.com", phone:"+48600123401", jobRole:"Electrician", nationality:"Polish", assignedSite:"Wroclaw-Site-B", hourlyNettoRate:36, bhpStatus:"2026-11-20", badaniaLekExpiry:"2026-11-28", pipelineStage:"Active" },
  { name:"Katarzyna Wisniewska", email:"katarzyna.wisniewska@example.com", phone:"+48600123402", jobRole:"Accountant", nationality:"Polish", assignedSite:"Warsaw-HQ", hourlyNettoRate:48, bhpStatus:"2027-01-20", badaniaLekExpiry:"2027-02-28", pipelineStage:"Active" },
  { name:"Vasyl Petrenko", email:"vasyl.petrenko@example.com", phone:"+380671234503", jobRole:"Welder MIG", nationality:"Ukrainian", assignedSite:"Wroclaw-Site-A", hourlyNettoRate:37, trcExpiry:"2026-04-08", workPermitExpiry:"2026-05-01", bhpStatus:"2026-06-10", badaniaLekExpiry:"2026-04-06", pipelineStage:"Screening" },
  { name:"Iryna Bondarenko", email:"iryna.bondarenko@example.com", phone:"+380671234504", jobRole:"Warehouse Operative", nationality:"Ukrainian", assignedSite:"Poznan-LogiTrans", hourlyNettoRate:25, trcExpiry:"2026-10-15", workPermitExpiry:"2026-10-20", bhpStatus:"2026-09-30", badaniaLekExpiry:"2026-10-12", pipelineStage:"Active" },
  { name:"Sandro Janelidze", email:"sandro.janelidze@example.com", phone:"+995551234503", jobRole:"Construction Worker", nationality:"Georgian", assignedSite:"Wroclaw-Site-B", hourlyNettoRate:30, trcExpiry:"2026-07-20", workPermitExpiry:"2026-07-25", bhpStatus:"2026-06-30", badaniaLekExpiry:"2026-07-18", pipelineStage:"Active" },
  { name:"Tamar Kvanchilashvili", email:"tamar.kvanchilashvili@example.com", phone:"+995551234504", jobRole:"Receptionist", nationality:"Georgian", assignedSite:"Warsaw-HQ", hourlyNettoRate:33, trcExpiry:"2026-11-10", workPermitExpiry:"2026-11-15", bhpStatus:"2026-10-25", badaniaLekExpiry:"2026-11-08", pipelineStage:"Active" },
  { name:"Arjun Patel", email:"arjun.patel@example.com", phone:"+919876543203", jobRole:"Software Developer", nationality:"Indian", assignedSite:"Warsaw-HQ", hourlyNettoRate:55, trcExpiry:"2026-06-15", workPermitExpiry:"2026-06-20", bhpStatus:"2026-05-30", badaniaLekExpiry:"2026-06-12", pipelineStage:"Active" },
  { name:"Sunita Rao", email:"sunita.rao@example.com", phone:"+919876543204", jobRole:"Healthcare Assistant", nationality:"Indian", assignedSite:"Warsaw-MediCare", hourlyNettoRate:34, trcExpiry:"2026-09-20", workPermitExpiry:"2026-09-25", bhpStatus:"2026-08-30", badaniaLekExpiry:"2026-09-18", pipelineStage:"Active" },
  { name:"Tran Minh Duc", email:"tran.minh.duc@example.com", phone:"+84901234503", jobRole:"Forklift Driver", nationality:"Vietnamese", assignedSite:"Wroclaw-Site-A", hourlyNettoRate:31, trcExpiry:"2026-08-05", workPermitExpiry:"2026-08-10", bhpStatus:"2026-07-20", badaniaLekExpiry:"2026-08-03", pipelineStage:"Active" },
  { name:"Pham Thi Lan", email:"pham.thi.lan@example.com", phone:"+84901234504", jobRole:"Cook", nationality:"Vietnamese", assignedSite:"Warsaw-Restaurant", hourlyNettoRate:26, trcExpiry:"2026-04-15", workPermitExpiry:"2026-04-20", bhpStatus:"2026-03-30", badaniaLekExpiry:"2026-04-13", pipelineStage:"Active" },
  { name:"Yusuf Al-Masri", email:"yusuf.al-masri@example.com", phone:"+201012345603", jobRole:"Welder MAG", nationality:"Egyptian", assignedSite:"Wroclaw-Site-A", hourlyNettoRate:36, trcExpiry:"2026-10-10", workPermitExpiry:"2026-10-15", bhpStatus:"2026-09-20", badaniaLekExpiry:"2026-10-08", pipelineStage:"Active" },
  { name:"Nadia Mostafa", email:"nadia.mostafa@example.com", phone:"+201012345604", jobRole:"Quality Inspector", nationality:"Egyptian", assignedSite:"Poznan-LogiTrans", hourlyNettoRate:34, trcExpiry:"2026-12-20", workPermitExpiry:"2026-12-25", bhpStatus:"2026-11-30", badaniaLekExpiry:"2026-12-18", pipelineStage:"Active" },
  { name:"Marek Kowalczyk", email:"marek.kowalczyk@example.com", phone:"+48600123403", jobRole:"Plumber", nationality:"Polish", assignedSite:"Wroclaw-Site-B", hourlyNettoRate:35, bhpStatus:"2026-08-15", badaniaLekExpiry:"2026-09-02", pipelineStage:"Active" },
  { name:"Anna Zielinska", email:"anna.zielinska@example.com", phone:"+48600123404", jobRole:"Nurse", nationality:"Polish", assignedSite:"Warsaw-MediCare", hourlyNettoRate:41, bhpStatus:"2026-10-30", badaniaLekExpiry:"2026-11-22", pipelineStage:"Active" },
  { name:"Andriy Lysenko", email:"andriy.lysenko@example.com", phone:"+380671234505", jobRole:"Fabricator", nationality:"Ukrainian", assignedSite:"Wroclaw-Site-B", hourlyNettoRate:33, trcExpiry:"2026-04-20", workPermitExpiry:"2026-04-25", bhpStatus:"2026-05-30", badaniaLekExpiry:"2026-04-18", pipelineStage:"Screening" },
  { name:"Nataliia Marchenko", email:"nataliia.marchenko@example.com", phone:"+380671234506", jobRole:"Cleaner", nationality:"Ukrainian", assignedSite:"Warsaw-Restaurant", hourlyNettoRate:23, trcExpiry:"2026-08-30", workPermitExpiry:"2026-09-01", bhpStatus:"2026-07-15", badaniaLekExpiry:"2026-08-28", pipelineStage:"Active" },
  { name:"Lasha Gurgenidze", email:"lasha.gurgenidze@example.com", phone:"+995551234505", jobRole:"Electrician", nationality:"Georgian", assignedSite:"Poznan-LogiTrans", hourlyNettoRate:37, trcExpiry:"2026-06-10", workPermitExpiry:"2026-06-15", bhpStatus:"2026-05-25", badaniaLekExpiry:"2026-06-08", pipelineStage:"Active" },
  { name:"Ketevan Lomidze", email:"ketevan.lomidze@example.com", phone:"+995551234506", jobRole:"Accountant", nationality:"Georgian", assignedSite:"Warsaw-HQ", hourlyNettoRate:44, trcExpiry:"2026-12-10", workPermitExpiry:"2027-01-05", bhpStatus:"2026-11-20", badaniaLekExpiry:"2026-12-08", pipelineStage:"Active" },
  { name:"Amit Verma", email:"amit.verma@example.com", phone:"+919876543205", jobRole:"Data Analyst", nationality:"Indian", assignedSite:"Warsaw-HQ", hourlyNettoRate:52, trcExpiry:"2026-07-05", workPermitExpiry:"2026-07-10", bhpStatus:"2026-06-15", badaniaLekExpiry:"2026-07-03", pipelineStage:"Active" },
  { name:"Divya Nair", email:"divya.nair@example.com", phone:"+919876543206", jobRole:"Receptionist", nationality:"Indian", assignedSite:"Warsaw-HQ", hourlyNettoRate:36, trcExpiry:"2026-04-25", workPermitExpiry:"2026-05-01", bhpStatus:"2026-04-10", badaniaLekExpiry:"2026-04-23", pipelineStage:"Active" },
  { name:"Hoang Van Minh", email:"hoang.van.minh@example.com", phone:"+84901234505", jobRole:"Warehouse Operative", nationality:"Vietnamese", assignedSite:"Poznan-LogiTrans", hourlyNettoRate:25, trcExpiry:"2026-09-15", workPermitExpiry:"2026-09-20", bhpStatus:"2026-08-30", badaniaLekExpiry:"2026-09-12", pipelineStage:"Active" },
  { name:"Bui Thi Thu", email:"bui.thi.thu@example.com", phone:"+84901234506", jobRole:"Security Guard", nationality:"Vietnamese", assignedSite:"Warsaw-HQ", hourlyNettoRate:28, trcExpiry:"2026-11-05", workPermitExpiry:"2026-11-10", bhpStatus:"2026-10-15", badaniaLekExpiry:"2026-11-03", pipelineStage:"Active" },
  { name:"Khaled Ibrahim", email:"khaled.ibrahim@example.com", phone:"+201012345605", jobRole:"Construction Worker", nationality:"Egyptian", assignedSite:"Wroclaw-Site-B", hourlyNettoRate:29, trcExpiry:"2026-05-20", workPermitExpiry:"2026-05-25", bhpStatus:"2026-04-30", badaniaLekExpiry:"2026-05-18", pipelineStage:"Active" },
  { name:"Mona Abdalla", email:"mona.abdalla@example.com", phone:"+201012345606", jobRole:"Healthcare Assistant", nationality:"Egyptian", assignedSite:"Warsaw-MediCare", hourlyNettoRate:33, trcExpiry:"2026-10-25", workPermitExpiry:"2026-10-30", bhpStatus:"2026-09-10", badaniaLekExpiry:"2026-10-22", pipelineStage:"Active" },
  { name:"Tomasz Dabrowski", email:"tomasz.dabrowski@example.com", phone:"+48600123405", jobRole:"Welder TIG", nationality:"Polish", assignedSite:"Wroclaw-Site-A", hourlyNettoRate:40, bhpStatus:"2026-11-25", badaniaLekExpiry:"2026-12-12", pipelineStage:"Active" },
  { name:"Magdalena Kaczmarek", email:"magdalena.kaczmarek@example.com", phone:"+48600123406", jobRole:"HR Manager", nationality:"Polish", assignedSite:"Warsaw-HQ", hourlyNettoRate:50, bhpStatus:"2027-01-10", badaniaLekExpiry:"2027-01-28", pipelineStage:"Active" },
  { name:"Oleksiy Rudenko", email:"oleksiy.rudenko@example.com", phone:"+380671234507", jobRole:"Forklift Driver", nationality:"Ukrainian", assignedSite:"Wroclaw-Site-A", hourlyNettoRate:32, trcExpiry:"2026-04-12", workPermitExpiry:"2026-04-18", bhpStatus:"2026-05-01", badaniaLekExpiry:"2026-04-10", pipelineStage:"Screening" },
  { name:"Yulia Tkachenko", email:"yulia.tkachenko@example.com", phone:"+380671234508", jobRole:"Cook", nationality:"Ukrainian", assignedSite:"Warsaw-Restaurant", hourlyNettoRate:27, trcExpiry:"2026-07-25", workPermitExpiry:"2026-07-30", bhpStatus:"2026-06-20", badaniaLekExpiry:"2026-07-22", pipelineStage:"Active" },
];

router.post("/admin/seed-workers", authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const existing = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM workers`);
    const count = (existing.rows[0] as { cnt: number }).cnt;
    if (count > 15) {
      return res.json({ message: "Already seeded", existingCount: count });
    }

    for (const w of SEED_WORKERS) {
      await db.execute(sql`
        INSERT INTO workers (name, email, phone, job_role, nationality, assigned_site, hourly_netto_rate, trc_expiry, work_permit_expiry, bhp_status, badania_lek_expiry, pipeline_stage)
        VALUES (${w.name}, ${w.email}, ${w.phone}, ${w.jobRole}, ${w.nationality}, ${w.assignedSite}, ${w.hourlyNettoRate}, ${w.trcExpiry ?? null}, ${w.workPermitExpiry ?? null}, ${w.bhpStatus}, ${w.badaniaLekExpiry}, ${w.pipelineStage})
        ON CONFLICT DO NOTHING
      `);
    }

    const total = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM workers`);
    const newCount = (total.rows[0] as { cnt: number }).cnt;
    return res.json({ message: "Seeded successfully", inserted: 40, total: newCount });
  } catch (err: any) {
    console.error("[seed] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
