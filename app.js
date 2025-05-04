require('dotenv').config();

const express       = require('express');
const session       = require('express-session');
const MongoStore    = require('connect-mongo');
const { MongoClient } = require('mongodb');

const {
  MONGODB_USER,
  MONGODB_PASSWORD,
  MONGODB_HOST,
  MONGODB_DATABASE,
  NODE_SESSION_SECRET,
  PORT = 8000
} = process.env;

const app = express();

const uri = `mongodb+srv://${encodeURIComponent(MONGODB_USER)}`
          + `:${encodeURIComponent(MONGODB_PASSWORD)}`
          + `@${MONGODB_HOST}/${MONGODB_DATABASE}`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

(async function startServer() {
    try {
      await client.connect();
      const db              = client.db(MONGODB_DATABASE);
      const usersCollection = db.collection('users');
  
      app.use(express.urlencoded({ extended: false }));
  
      app.use(session({
        secret: NODE_SESSION_SECRET,
        store: MongoStore.create({ client }),
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 1000 * 60 * 60 }
      }));
  
      app.use(express.static('public'));
  
      app.set('view engine', 'ejs');
      app.set('views', './views');
  

      app.get('/', (req, res) => {
        if (req.session.userId) {
          return res.redirect('/members');
        }
        res.render('index');
      });
  

      app.use((req, res) => {
        res.status(404).render('404');
      });

      app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
      });
  
    } catch (err) {
      console.error('Startup error:', err);
      process.exit(1);
    }
  })();
