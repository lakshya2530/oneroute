const { Sequelize, DataTypes } = require('sequelize');

// Use dotenv to load DB credentials from .env
require('dotenv').config();

// Option 1: Use DB_URI directly
// const sequelize = new Sequelize(process.env.DB_URI);

// Option 2: Separate DB config
// const sequelize = new Sequelize(
//   process.env.DB_NAME,
//   process.env.DB_USER,
//   process.env.DB_PASSWORD,
//   {
//     host: process.env.DB_HOST,
//     dialect: 'postgres',
//   }
  
// );


const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    define: {
      schema: 'public', // 👈 This is important
    },
  }
);

// Initialize DB object
const db = {};
db.sequelize = sequelize;
db.Sequelize = Sequelize;

// Load Models
db.Job = require('./Job')(sequelize, DataTypes);
db.User = require('./user')(sequelize, DataTypes);
db.Project = require('./Project')(sequelize, DataTypes);
db.Post = require('./Post')(sequelize, DataTypes);
db.Article = require('./Articles')(sequelize, DataTypes);
db.Event = require('./Event')(sequelize, DataTypes);
db.Course = require('./course')(sequelize, DataTypes);
db.Resource = require('./Resource')(sequelize, DataTypes);
db.Like = require('./Like')(sequelize, DataTypes);
db.Application = require('./Application')(sequelize, DataTypes);
db.SavedJob = require('./SavedJob')(sequelize, DataTypes);
db.Message = require('./message')(sequelize, DataTypes);
db.Notification = require('./Notification')(sequelize, DataTypes);
db.NotificationTemplate = require('./NotificationTemplate')(sequelize, DataTypes);
db.UserExperience = require('./UserExperience')(sequelize, DataTypes);
db.PortfolioItem = require('./PortfolioItem')(sequelize, DataTypes);
db.ChatRequest = require('./ChatRequest')(sequelize, DataTypes);
db.Payment = require('./Payment')(sequelize, DataTypes);
db.Transaction = require('./Transaction')(sequelize, DataTypes);

module.exports = db;
