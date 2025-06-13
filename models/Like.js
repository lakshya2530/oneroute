module.exports = (sequelize, DataTypes) => {
    const Like = sequelize.define('Like', {
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      post_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    }, {
      timestamps: true,
      underscored: true,
      tableName: 'likes',
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'post_id']
        }
      ]
    });
  
    return Like;
  };
  