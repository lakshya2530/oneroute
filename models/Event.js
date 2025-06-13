module.exports = (sequelize, DataTypes) => {
    const Event = sequelize.define('Event', {
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },  
      time: {
        type: DataTypes.TIME,
        allowNull: false
      },
      location: {
        type: DataTypes.STRING,
        allowNull: false
      },
      event_type: {
        type: DataTypes.STRING,
        allowNull: false
      },
      featured_image_url: {
        type: DataTypes.STRING,
        allowNull: true
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      event_status: {
        type: DataTypes.STRING,
        allowNull: true
      },
      expected_attribute: {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    }, {
      timestamps: true,   // This will automatically add createdAt and updatedAt
      underscored: true,  // This will use snake_case for the columns (created_at, updated_at)
      tableName: 'events'
    });
  
    return Event;
  };
  