module.exports = (sequelize, DataTypes) => {
    const Transaction = sequelize.define('Transaction', {
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      razorpay_payment_id: {
        type: DataTypes.STRING,
        allowNull: false
      },
      razorpay_order_id: {
        type: DataTypes.STRING,
        allowNull: false
      },
      plan_name: {
        type: DataTypes.ENUM('monthly', 'quarterly', 'yearly'),
        allowNull: false
      },
      amount: {
        type: DataTypes.INTEGER,
        allowNull: false // Stored in paise (e.g., ₹499 = 49900)
      },
      currency: {
        type: DataTypes.STRING,
        defaultValue: 'INR'
      },
      payment_status: {
        type: DataTypes.ENUM('created', 'paid', 'failed'),
        defaultValue: 'created'
      },
      payment_method: {
        type: DataTypes.STRING,
        allowNull: true // card, netbanking, wallet, etc.
      }
    }, {
      tableName: 'transactions',
      timestamps: true
    });
  
    return Transaction;
  };
  