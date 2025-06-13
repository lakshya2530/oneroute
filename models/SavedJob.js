module.exports = (sequelize, DataTypes) => {
    const SavedJob = sequelize.define('SavedJob', {
      job_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    }, {
      timestamps: true,
      underscored: true,
      tableName: 'saved_jobs'
    });
  
    return SavedJob;
  };
  