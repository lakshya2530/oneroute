module.exports = (sequelize, DataTypes) => {
    const Resource = sequelize.define('Resource', {
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT
      },
      type: {
        type: DataTypes.STRING
      },
      file_url: {
        type: DataTypes.STRING
      },
      featured_image_url: {
        type: DataTypes.STRING
      }
    }, {
      timestamps: true,
      underscored: true,
      tableName: 'resources'
    });
  
    return Resource;
  };
  