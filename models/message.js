module.exports = (sequelize, DataTypes) => {
    const Message = sequelize.define('Message', {
      sender_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      receiver_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      is_read: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      }
    }, {
      tableName: 'messages',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    });
  
    // Optional associations
    Message.associate = (models) => {
      Message.belongsTo(models.User, { as: 'Sender', foreignKey: 'sender_id' });
      Message.belongsTo(models.User, { as: 'Receiver', foreignKey: 'receiver_id' });
    };
  
    return Message;
  };
  