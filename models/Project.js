module.exports = (sequelize, DataTypes) => {
    const Project = sequelize.define('Project', {
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: DataTypes.TEXT,
      location: DataTypes.STRING,
      status: {
        type: DataTypes.ENUM('Planning', 'Pre-production', 'Production', 'Post-production', 'Completed'),
        defaultValue: 'Planning',
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    }, {
      tableName: 'projects', // 🔥 Explicit lowercase table name
      timestamps: true       // 👍 Ensures Sequelize knows to use createdAt / updatedAt
    });
  
    Project.associate = models => {
      Project.belongsTo(models.User, { foreignKey: 'user_id' });
    };
  
    return Project;
  };
  