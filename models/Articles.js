// models/Article.js
module.exports = (sequelize, DataTypes) => {
    const Article = sequelize.define('Article', {
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      excerpt: {
        type: DataTypes.STRING,
        allowNull: true
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      category: {
        type: DataTypes.STRING,
        allowNull: false
      },
      read_time: {
        type: DataTypes.INTEGER, // e.g., minutes
        allowNull: true
      },
      featured_image_url: {
        type: DataTypes.STRING,
        allowNull: true
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    }, {
      timestamps: false, // Disable automatic createdAt and updatedAt fields
      tableName: 'articles' // Ensure the table name is correctly set
    });
  
    return Article;
  };
  