module.exports = (sequelize, DataTypes) => {
    const Course = sequelize.define('Course', {
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      instructor: {
        type: DataTypes.STRING,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      no_of_lessons: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      duration: {
        type: DataTypes.FLOAT, // Store duration in hours
        allowNull: false
      },
      level: {
        type: DataTypes.STRING,
        allowNull: false
      },
      featured_image_url: {
        type: DataTypes.STRING,
        allowNull: true
      }
    }, {
      timestamps: true, // Automatically adds createdAt and updatedAt columns
      underscored: true, // Use snake_case for column names
      tableName: 'courses'
    });
  
    return Course;
  };
  