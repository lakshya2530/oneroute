module.exports = (sequelize, DataTypes) => {
    const ChatRequest = sequelize.define('ChatRequest', {
      sender_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      receiver_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('pending', 'accepted', 'rejected'),
        defaultValue: 'pending'
      }
    }, {
      tableName: 'chat_requests',
      timestamps: true
    });
  
    return ChatRequest;
  };
  