module.exports = (sequelize, DataTypes) => {
    const NotificationTemplate = sequelize.define('NotificationTemplate', {
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false
      },
      audience: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'All Users'
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Draft' // or 'Sent'
      }
    }, {
      tableName: 'notification_templates',
      underscored: true,
      timestamps: true
    });
  
    return NotificationTemplate;
  };
  