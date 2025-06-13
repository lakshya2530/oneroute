// routes/jobs.js
const express = require("express");
const { Job } = require("../models");
const { Application } = require("../models");
const { User } = require("../models");
const { Op } = require("sequelize");
const authenticateToken = require("../middleware/auth");
const router = express.Router();
const { sequelize } = require("../models"); // ✅ This line is required

//router.use(authenticateToken);

// 🔍 GET jobs for logged-in user

// router.get("/", async (req, res) => {
//   const {
//     title,
//     location,
//     type,
//     roleCategory,
//     experienceLevel,
//     min_salary,
//     max_salary,
//   } = req.query;

//   const where = {};

//   if (title) {
//     where.job_title = { [Op.iLike]: `%${title}%` };
//   }

//   if (location) {
//     where.location = { [Op.iLike]: `%${location}%` };
//   }

//   if (type) {
//     const types = type.split(",");
//     where.job_type = { [Op.in]: types };
//   }

//   if (roleCategory) {
//     const categories = roleCategory.split(",");
//     where.role_category = { [Op.in]: categories };
//   }

//   if (experienceLevel) {
//     const levels = experienceLevel.split(",");
//     where.experience_level = { [Op.in]: levels };
//   }

//   if (min_salary) {
//     where.min_salary = {};
//     if (min_salary) where.min_salary[Op.gte] = Number(min_salary);
//   }
//   if (max_salary) {
//     where.max_salary = {};
//     if (max_salary) where.max_salary[Op.lte] = Number(max_salary);
//   }

//   try {
//     const jobs = await Job.findAll({ where });
//     res.json(jobs);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// // 🆕 Create a new job
// router.post("/", async (req, res) => {
//   console.log("📥 Incoming body:", req.body);

//   try {
//     const newJob = await Job.create({
//       ...req.body,
//     });

//     console.log("✅ New job created:", newJob);
//     res.status(201).json(newJob);
//   } catch (err) {
//     console.error("❌ Error creating job:", err);
//     res.status(400).json({ error: err.message });
//   }
// });

// // ✏️ Update a job (only if it belongs to the user)
// router.put("/:id", authenticateToken, async (req, res) => {
//   try {
//     const job = await Job.findOne({
//       where: { id: req.params.id, user_id: req.user.user_id },
//     });
//     if (!job)
//       return res.status(404).json({ error: "Job not found or unauthorized" });

//     await job.update(req.body);
//     res.json(job);
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// // ❌ Delete a job (only if it belongs to the user)
// router.delete("/:id", authenticateToken, async (req, res) => {
//   try {
//     const job = await Job.findOne({
//       where: { id: req.params.id, user_id: req.user.user_id },
//     });
//     if (!job)
//       return res.status(404).json({ error: "Job not found or unauthorized" });

//     await job.destroy();
//     res.json({ message: "Job deleted successfully" });
//   } catch (err) {
//     res.status(400).json({ error: err.message });
//   }
// });

// router.post("/submit", async (req, res) => {
//   try {
//     const {
//       job_id,
//       user_id,
//       resume_url,
//       cover_letter,
//       additional_information,
//     } = req.body;

//     if (!job_id || !user_id || !cover_letter) {
//       return res.status(400).json({
//         success: false,
//         message: "job_id, user_id, and cover_letter are required",
//       });
//     }

//     const application = await Application.create({
//       job_id,
//       user_id,
//       resume_url,
//       cover_letter,
//       additional_information,
//     });

//     res.status(201).json({
//       success: true,
//       message: "Application submitted successfully",
//       data: application,
//     });
//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Error submitting application",
//       error: err.message,
//     });
//   }
// });


router.get("/", authenticateToken, async (req, res) => {
  const {
    title,
    location,
    type,
    roleCategory,
    experienceLevel,
    min_salary,
    max_salary,
  } = req.query;

  const where = {
    user_id: req.user.user_id,
  };

  if (title) {
    where.job_title = { [Op.iLike]: `%${title}%` };
  }

  if (location) {
    where.location = { [Op.iLike]: `%${location}%` };
  }

  if (type) {
    const types = type.split(",");
    where.job_type = { [Op.in]: types };
  }

  if (roleCategory) {
    const categories = roleCategory.split(",");
    where.role_category = { [Op.in]: categories };
  }

  if (experienceLevel) {
    const levels = experienceLevel.split(",");
    where.experience_level = { [Op.in]: levels };
  }

  if (min_salary) {
    where.min_salary = { [Op.gte]: Number(min_salary) };
  }

  if (max_salary) {
    where.max_salary = { [Op.lte]: Number(max_salary) };
  }

  try {
    const jobs = await Job.findAll({ where });
    res.json({ success: true, data: jobs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/admin", async (req, res) => {
  const {
    title,
    location,
    type,
    roleCategory,
    experienceLevel,
    min_salary,
    max_salary,
  } = req.query;

  const where = {
   // user_id: req.user.user_id,
  };

  if (title) {
    where.job_title = { [Op.iLike]: `%${title}%` };
  }

  if (location) {
    where.location = { [Op.iLike]: `%${location}%` };
  }

  if (type) {
    const types = type.split(",");
    where.job_type = { [Op.in]: types };
  }

  if (roleCategory) {
    const categories = roleCategory.split(",");
    where.role_category = { [Op.in]: categories };
  }

  if (experienceLevel) {
    const levels = experienceLevel.split(",");
    where.experience_level = { [Op.in]: levels };
  }

  if (min_salary) {
    where.min_salary = { [Op.gte]: Number(min_salary) };
  }

  if (max_salary) {
    where.max_salary = { [Op.lte]: Number(max_salary) };
  }

  try {
    const jobs = await Job.findAll({ where });
    res.json({ success: true, data: jobs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


router.patch('/admin/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'approved' or 'rejected'

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid status. Must be "approved" or "rejected".',
    });
  }

  try {
    const job = await Job.findByPk(id);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found.',
      });
    }

    job.status = status;
    await job.save();

    res.json({
      success: true,
      message: `Job has been ${status}.`,
      data: job,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message,
    });
  }
});



router.post("/admin", async (req, res) => {
  console.log("📥 Incoming body:", req.body);

  try {
    const newJob = await Job.create({
      ...req.body,
      user_id: 0, // 👈 Set user_id from token
    });

    console.log("✅ New job created:", newJob);
    res.status(201).json(newJob);
  } catch (err) {
    console.error("❌ Error creating job:", err);
    res.status(400).json({ error: err.message });
  }
});
// ✏️ Update a job (only if it belongs to the user)
router.put("/admin/:id", async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { id: req.params.id },
    });

    if (!job)
      return res.status(404).json({ error: "Job not found or unauthorized" });

    await job.update(req.body);
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ❌ Delete a job (only if it belongs to the user)
router.delete("/admin/:id", async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { id: req.params.id },
    });

    if (!job)
      return res.status(404).json({ error: "Job not found or unauthorized" });

    await job.destroy();
    res.json({ message: "Job deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/admin/:id/status", async (req, res) => {
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: "Status is required" });
  }

  try {
    const job = await Job.findByPk(req.params.id);

    if (!job)
      return res.status(404).json({ error: "Job not found" });

    await job.update({ status });
    res.json({ message: `Job status updated to ${status}`, job });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 🆕 Create a new job
router.post("/", authenticateToken, async (req, res) => {
  console.log("📥 Incoming body:", req.body);

  try {
    const newJob = await Job.create({
      ...req.body,
      user_id: req.user.user_id, // 👈 Set user_id from token
    });

    console.log("✅ New job created:", newJob);
    res.status(201).json(newJob);
  } catch (err) {
    console.error("❌ Error creating job:", err);
    res.status(400).json({ error: err.message });
  }
});

// ✏️ Update a job (only if it belongs to the user)
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { id: req.params.id, user_id: req.user.user_id },
    });

    if (!job)
      return res.status(404).json({ error: "Job not found or unauthorized" });

    await job.update(req.body);
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ❌ Delete a job (only if it belongs to the user)
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const job = await Job.findOne({
      where: { id: req.params.id, user_id: req.user.user_id },
    });

    if (!job)
      return res.status(404).json({ error: "Job not found or unauthorized" });

    await job.destroy();
    res.json({ message: "Job deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ✅ Submit an application (use token to get user_id)
router.post("/submit", authenticateToken, async (req, res) => {
  try {
    const {
      job_id,
      resume_url,
      cover_letter,
      additional_information,
    } = req.body;

    if (!job_id || !cover_letter) {
      return res.status(400).json({
        success: false,
        message: "job_id and cover_letter are required",
      });
    }

    const application = await Application.create({
      job_id,
      user_id: req.user.user_id, // 👈 Use authenticated user ID
      resume_url,
      cover_letter,
      additional_information,
    });

    res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      data: application,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error submitting application",
      error: err.message,
    });
  }
});

router.get("/user-saved-jobs", authenticateToken, async (req, res) => {
  try {
    const savedJobs = await Application.findAll({
      where: { user_id: req.user.user_id },
      include: [
        {
          model: Job, // assuming you have a Job model related
          attributes: ["id", "title", "company", "location", "salary"]
        }
      ],
      order: [["createdAt", "DESC"]]
    });

    res.json({
      success: true,
      message: "Saved jobs fetched successfully",
      data: savedJobs
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching saved jobs",
      error: err.message
    });
  }
});


router.get("/my-jobs-with-applicants", authenticateToken, async (req, res) => {
  try {
    const jobs = await Job.findAll({
      where: { user_id: req.user.user_id }, // your user who posted the jobs
      attributes: ["id", "job_title"],
      // include: [
      //   {
      //     model: Application,
      //     attributes: ["id", "user_id"],
      //     include: [
      //       {
      //         model: User,
      //         attributes: ["id", "name", "email"]
      //       }
      //     ]
      //   }
      // ],
      order: [["createdAt", "DESC"]]
    });

    // Format response: flatten nested user data
    const formatted = jobs.map(job => ({
      job_id: job.id,
      title: job.job_title,
      // applications: job.Applications.map(app => ({
      //   user_id: app.User.id,
      //   name: app.User.name,
      //   email: app.User.email
      // }))
    }));

    res.json({
      success: true,
      message: "Jobs with applicants fetched successfully",
      data: formatted
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching job applicants",
      error: err.message
    });
  }
});

router.get("/job-applicants/:job_id", authenticateToken, async (req, res) => {
  const { job_id } = req.params;

  try {
    const [results] = await sequelize.query(
      `SELECT users.id AS user_id, users.username, users.email,applications.status
       FROM applications
       JOIN users ON applications.user_id = users.id
       WHERE applications.job_id = :jobId
       ORDER BY applications.created_at DESC`,
      {
        replacements: { jobId: job_id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      message: "Applicants fetched successfully",
      data: results
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error fetching applicants",
      error: err.message
    });
  }
});

router.post("/hire", authenticateToken, async (req, res) => {
  const { job_id, user_id } = req.body;

  if (!job_id || !user_id) {
    return res.status(400).json({
      success: false,
      message: "job_id and user_id are required"
    });
  }

  try {
    // Step 1: Check if the job belongs to the current user
    const job = await Job.findOne({
      where: {
        id: job_id,
        user_id: req.user.user_id // or job.owner_id, based on your schema
      }
    });

    if (!job) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to hire for this job"
      });
    }

    // Step 2: Check if the user applied to this job
    const application = await Application.findOne({
      where: {
        job_id,
        user_id
      }
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "This user has not applied to the job"
      });
    }

    // Step 3: Update application status to 'hired'
    application.status = "hired";
    await application.save();

    res.json({
      success: true,
      message: "User has been successfully hired",
      data: {
        job_id,
        user_id,
        status: application.status
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error hiring user",
      error: err.message
    });
  }
});


module.exports = router;
