const express = require("express");
const router = express.Router();
const pool = require("../../db/connection.js");

router.get("/", async (req, res) => {
  try {
    const conn = await pool.getConnection();

    // Get today's date for filtering
    const today = new Date().toISOString().split("T")[0];

    // 1. Active Bookings (bookings with status 'pending' or 'confirmed')
    const [activeBookingsResult] = await conn.query(
      `SELECT COUNT(*) as count FROM bookings WHERE status IN ('pending', 'confirmed')`
    );
    const activeBookings = activeBookingsResult[0].count;

    // 2. Available Vehicles (vehicles that are active and available)
    const [availableVehiclesResult] = await conn.query(
      `SELECT COUNT(*) as count FROM vehicles WHERE id IS NOT NULL` // Adjust condition based on your availability logic
    );
    const availableVehicles = availableVehiclesResult[0].count;

    // 3. Pending Verifications (users not verified)
    const [pendingVerificationsResult] = await conn.query(
      `SELECT COUNT(*) as count FROM users WHERE verified = 0`
    );
    const pendingVerifications = pendingVerificationsResult[0].count;

    // 4. Revenue Today (sum of amounts from completed bookings today)
    const [revenueTodayResult] = await conn.query(
      `SELECT COALESCE(SUM(amount), 0) as revenue FROM bookings 
       WHERE DATE(created_at) = ? AND status = 'completed'`,
      [today]
    );
    const revenueToday = revenueTodayResult[0].revenue;

    // 5. Weekly Revenue Trend (last 7 days)
    const [weeklyRevenueResult] = await conn.query(
      `SELECT 
        DATE(created_at) as date,
        COALESCE(SUM(amount), 0) as revenue
       FROM bookings 
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) 
         AND status = 'completed'
       GROUP BY DATE(created_at)
       ORDER BY date`
    );

    // Format weekly revenue data for chart
    const weeklyRevenue = [];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Create last 7 days array
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      last7Days.push(date.toISOString().split("T")[0]);
    }

    // Fill in revenue data for each day
    last7Days.forEach((date) => {
      const dayData = weeklyRevenueResult.find(
        (item) => item.date.toISOString().split("T")[0] === date
      );
      const dayName = days[new Date(date).getDay()];
      weeklyRevenue.push({
        day: dayName,
        revenue: dayData ? parseFloat(dayData.revenue) : 0,
      });
    });

    // 6. Bookings Breakdown by Status
    const [bookingsBreakdownResult] = await conn.query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM bookings 
       GROUP BY status`
    );

    // Calculate total bookings
    const totalBookings = bookingsBreakdownResult.reduce(
      (total, item) => total + item.count,
      0
    );

    // Format bookings breakdown
    const bookingsBreakdown = bookingsBreakdownResult.map((item) => ({
      status: item.status,
      count: item.count,
      percentage: ((item.count / totalBookings) * 100).toFixed(1),
    }));

    // 7. Recent Activities (latest 5 bookings with user info)
    const [recentActivitiesResult] = await conn.query(
      `SELECT 
        b.id,
        b.status,
        b.amount,
        b.created_at,
        u.fullname,
        u.phone
       FROM bookings b
       LEFT JOIN users u ON b.customer_id = u.id
       ORDER BY b.created_at DESC
       LIMIT 5`
    );

    const recentActivities = recentActivitiesResult.map((activity) => ({
      id: activity.id,
      customer_name: activity.fullname || "Unknown",
      customer_phone: activity.phone,
      status: activity.status,
      amount: activity.amount,
      created_at: activity.created_at,
    }));

    // 8. Vehicle Statistics
    const [vehicleStatsResult] = await conn.query(
      `SELECT 
        COUNT(*) as total_vehicles,
        COUNT(DISTINCT vehicle_make) as unique_makes,
        COUNT(DISTINCT vehicle_year) as unique_years
       FROM vehicles`
    );

    const vehicleStats = vehicleStatsResult[0];

    // 9. User Statistics
    const [userStatsResult] = await conn.query(
      `SELECT 
        COUNT(*) as total_users,
        SUM(verified) as verified_users,
        SUM(offer_ride) as ride_offering_users
       FROM users`
    );

    const userStats = userStatsResult[0];

    conn.release();

    // Compile final dashboard data
    const dashboardData = {
      success: true,
      data: {
        overview: {
          active_bookings: activeBookings,
          available_vehicles: availableVehicles,
          pending_verifications: pendingVerifications,
          revenue_today: parseFloat(revenueToday),
        },
        revenue_trend: {
          weekly: weeklyRevenue,
        },
        bookings_breakdown: {
          total: totalBookings,
          by_status: bookingsBreakdown,
        },
        statistics: {
          vehicles: {
            total: vehicleStats.total_vehicles,
            unique_makes: vehicleStats.unique_makes,
            unique_years: vehicleStats.unique_years,
          },
          users: {
            total: userStats.total_users,
            verified: userStats.verified_users,
            ride_offering: userStats.ride_offering_users,
          },
        },
        recent_activities: recentActivities,
        last_updated: new Date().toISOString(),
      },
    };

    return res.json(dashboardData);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard data",
      error: err.message,
    });
  }
});

router.get("/revenue-trend", async (req, res) => {
  try {
    const conn = await pool.getConnection();

    // 1) Get year & month from query (default: current month)
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1; // 1-12

    // First and last day of selected month
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0); // last day of month

    const monthStartStr = monthStart.toISOString().split("T")[0];
    const monthEndStr = monthEnd.toISOString().split("T")[0];

    // 2) Fetch daily revenue for this month
    const [rows] = await conn.query(
      `
        SELECT 
          DATE(created_at) AS date,
          COALESCE(SUM(estimated_amount), 0) AS revenue
        FROM ride_requests
        WHERE DATE(created_at) BETWEEN ? AND ?
          AND status = 'completed'
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at)
      `,
      [monthStartStr, monthEndStr]
    );

    conn.release();

    // 3) Bucket days into weeks-of-month
    const getWeekOfMonth = (d) => {
      const day = d.getDate(); // 1..31
      return Math.floor((day - 1) / 7) + 1; // 1..5(6)
    };

    const weeksMap = new Map();

    rows.forEach((row) => {
      const d = new Date(row.date);
      const weekIndex = getWeekOfMonth(d);
      const key = `week_${weekIndex}`;
      const revenueNum = parseFloat(row.revenue) || 0;

      if (!weeksMap.has(key)) {
        weeksMap.set(key, {
          week: weekIndex,
          label: `Week ${weekIndex}`,
          revenue: 0,
        });
      }

      const current = weeksMap.get(key);
      current.revenue += revenueNum;
    });

    const weekly = Array.from(weeksMap.values()).sort(
      (a, b) => a.week - b.week
    );

    return res.json({
      success: true,
      data: {
        year,
        month,
        weekly,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch revenue trend",
      error: err.message,
    });
  }
});

module.exports = router;
