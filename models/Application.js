module.exports = (sequelize, DataTypes) => {
    const Application = sequelize.define('Application', {
      job_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      resume_url: {
        type: DataTypes.STRING,
        allowNull: true
      },
      cover_letter: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      status: {
        type: DataTypes.STRING,
        defaultValue: 'applied', // other possible values: hired, rejected
      },
      additional_information: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    }, {
      timestamps: true,
      underscored: true,
      tableName: 'applications'
    });
  
    return Application;
  };
  