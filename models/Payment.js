module.exports = (sequelize, DataTypes) => {
    const Transaction = sequelize.define('Transaction', {
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      plan_name: {
        type: DataTypes.STRING,
       // type: DataTypes.ENUM('monthly', 'quarterly', 'yearly'),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2), // for values like 29.99
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING,
        defaultValue: 'INR',
      },
      razorpay_order_id: {
        type: DataTypes.STRING,
      },
      razorpay_payment_id: {
        type: DataTypes.STRING,
      },
      payment_status: {
        type: DataTypes.ENUM('created', 'paid', 'failed'),
        defaultValue: 'created',
      },
      payment_method: {
        type: DataTypes.STRING, // e.g. card, netbanking
      },
    }, {
      tableName: 'transactions',
      timestamps: true,
      underscored: true, // If you want snake_case in DB: created_at, updated_at
    });
  
    return Transaction;
  };
  