module.exports = (sequelize, DataTypes) => {
    const PortfolioItem = sequelize.define('PortfolioItem', {
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      type: {
        type: DataTypes.ENUM('audio', 'video', 'document', 'image'),
        allowNull: false
      },
      file_path: {
        type: DataTypes.STRING,
        allowNull: false
      }
    }, {});
    return PortfolioItem;
  };
  