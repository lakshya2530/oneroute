module.exports = (sequelize, DataTypes) => {
    const Notification = sequelize.define('Notification', {
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
          },
          sender_id: {
            type: DataTypes.INTEGER
          },
          type: {
            type: DataTypes.STRING,
            allowNull: false
          },
          reference_id: {
            type: DataTypes.INTEGER
          },
          content: {
            type: DataTypes.TEXT
          },
          is_read: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
          }
        }, {
          timestamps: true,
          underscored: true,
        });
  
    return Notification;
  };
  



