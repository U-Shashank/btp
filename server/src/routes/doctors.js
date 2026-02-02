const express = require("express");
const { isDoctorActive, getDoctorInfo, getOracleAdmin, getAllDoctors, getDoctorCount, addDoctor, toggleDoctorStatus } = require("../services/doctorOracle");

const router = express.Router();

/**
 * GET /api/doctors
 * Get list of all doctors from blockchain
 */
router.get("/", async (req, res, next) => {
  try {
    // Fetch all doctor addresses from blockchain
    const doctorAddresses = await getAllDoctors();
    
    // Fetch info for all doctors
    const doctorsInfo = await Promise.all(
      doctorAddresses.map(async (address) => {
        const info = await getDoctorInfo(address);
        return {
          address,
          active: info.active,
          lastUpdated: info.lastUpdated,
        };
      })
    );

    res.json({ doctors: doctorsInfo });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/doctors/admin
 * Get the oracle admin address
 */
router.get("/admin", async (req, res, next) => {
  try {
    const admin = await getOracleAdmin();
    res.json({ admin });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/doctors/:address
 * Get information about a specific doctor
 */
router.get("/:address", async (req, res, next) => {
  try {
    const { address } = req.params;
    
    const info = await getDoctorInfo(address);
    const isActive = await isDoctorActive(address);

    res.json({
      address,
      active: isActive,
      lastUpdated: info.lastUpdated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/doctors
 * Add a new doctor (admin only)
 * Body: { doctorAddress: string }
 */
router.post("/", async (req, res, next) => {
  try {
    const { doctorAddress } = req.body;

    if (!doctorAddress) {
      return res.status(400).json({ 
        message: "Missing doctorAddress in request body" 
      });
    }

    const result = await addDoctor(doctorAddress);

    res.json({
      message: "Doctor added successfully",
      ...result,
    });
  } catch (error) {
    // Handle specific contract errors
    if (error.message.includes("OnlyAdmin")) {
      return res.status(403).json({ 
        message: "Only oracle admin can add doctors" 
      });
    }
    if (error.message.includes("DoctorAlreadyExists")) {
      return res.status(400).json({ 
        message: "Doctor already exists in oracle" 
      });
    }
    if (error.message.includes("InvalidDoctorAddress")) {
      return res.status(400).json({ 
        message: "Invalid doctor address" 
      });
    }
    
    next(error);
  }
});

/**
 * PUT /api/doctors/:address/toggle
 * Toggle doctor's active status (admin only)
 */
router.put("/:address/toggle", async (req, res, next) => {
  try {
    const { address } = req.params;

    const result = await toggleDoctorStatus(address);

    res.json({
      message: `Doctor status updated to ${result.newStatus ? "active" : "suspended"}`,
      ...result,
    });
  } catch (error) {
    // Handle specific contract errors
    if (error.message.includes("OnlyAdmin")) {
      return res.status(403).json({ 
        message: "Only oracle admin can toggle doctor status" 
      });
    }
    if (error.message.includes("DoctorDoesNotExist")) {
      return res.status(404).json({ 
        message: "Doctor does not exist in oracle" 
      });
    }
    
    next(error);
  }
});

module.exports = router;
