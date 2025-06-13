module.exports = (sequelize, DataTypes) => {
  const Job = sequelize.define('Job', {
    job_title: { type: DataTypes.STRING, allowNull: false },
    company: { type: DataTypes.STRING, allowNull: false },
    company_logo_url: DataTypes.TEXT,
    job_type: { type: DataTypes.ENUM("Full-time", "Part-time", "Contract"), allowNull: false },
    role_category: { type: DataTypes.STRING, allowNull: false },
    location: { type: DataTypes.STRING, allowNull: false },
    location_type: { type: DataTypes.ENUM("On-site", "Remote", "Hybrid"), allowNull: false },
    min_salary: DataTypes.INTEGER,
    max_salary: DataTypes.INTEGER,
    currency: { type: DataTypes.STRING, defaultValue: "USD" },
    payment_period: { type: DataTypes.STRING, defaultValue: "Yearly" },
    application_deadline: DataTypes.DATE,
    job_description: { type: DataTypes.TEXT, allowNull: false },
    requirements: DataTypes.ARRAY(DataTypes.TEXT),
    responsibilities: DataTypes.ARRAY(DataTypes.TEXT),
    tags: DataTypes.ARRAY(DataTypes.TEXT),
    application_url: DataTypes.TEXT,
    application_email: DataTypes.TEXT,
    is_featured: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: { type: DataTypes.STRING, defaultValue: "pending" },
    user_id: {
      type: DataTypes.STRING,
      allowNull: true,
    }
  }, {
    tableName: 'jobs',
    timestamps: true,
    underscored: true
  });

  return Job;
};
