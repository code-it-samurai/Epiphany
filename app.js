// //jshint esversion:6
const express= require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');
const LocalStrategy = require('passport-local').Strategy;
require('dotenv').config()

const app = express();
app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended: true}));
app.set('view engine', 'ejs');

app.use(session({
  secret: "helloworld",
  resave: false,
  saveUninitialized: false
}))

app.use(passport.initialize());
app.use(passport.session());

// mongoose.connect("mongodb://localhost:27017/secretsuserDB", {useNewUrlParser: true ,  useUnifiedTopology: true, useCreateIndex: true });
var url = "mongodb+srv://admin-peter:hello123@cluster0.joio0.mongodb.net/epiphanyDB?retryWrites=true&w=majority";
mongoose.connect(url, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true 
});
mongoose.set('useFindAndModify', false);

const epiphaniesSchema = new mongoose.Schema({
  epiphanyTitle:{
    type:String
  },
  epiphany:{
    type:String,
  },
  author:{
    authorID:String,
    authorName:String,
  },
  date:{
    type: Date,
    default: new Date().toLocaleDateString("en-US")
  },
  epiphanyCategory:{
    type:String,
    default:"non-categorized"
  }
});

const userSchema = new mongoose.Schema ({
  username:{
    type:String,
    unique:false
  },
  email:{
    type:String,
    unique: false
  },
  password:{
    type:String,
    unique: false
  },
  googleId:{
    type:String,
    unique: false
  },
  epiphanies:[epiphaniesSchema]
});

const postVotesSchema = new mongoose.Schema({
  postId : String,
  voteCount :{
    type:Number,
    unique: false,
    default: 0
  },
  upvoters : [userSchema],
  downvoters : [userSchema]
});

userSchema.plugin(passportLocalMongoose,  { usernameField : 'email' });

const User = new mongoose.model("User", userSchema);
const Epiphany= new mongoose.model("Epiphany", epiphaniesSchema);
const PostVotes = new mongoose.model("PostVote", postVotesSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

const googleOptions ={
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "https://stark-meadow-89523.herokuapp.com/auth/google/secretsbook",
    userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
  };
passport.use(new GoogleStrategy(googleOptions,function(accessToken,refreshToken,profile,cb){
        User.findOne({
            'googleId': profile.id 
        }, function(err, user) {
            if (err) {
                return cb(err);
            }
            //No user was found... so create a new user with values from Facebook (all the profile. stuff)
            if (!user) {
                newUser = new User({
                    username:profile.name.givenName,
                    googleId: profile.id,
                    //now in the future searching on User.findOne({'facebook.id': profile.id } will match because of this next line
                });
                newUser.save(function(err) {
                    if (err) console.log(err);
                    return cb(err, newUser);
                });
            } else {
                //found user. Return 
                return cb(err, user);
            }
        });
  }));

app.get('/', function(req, res){
    if(req.isAuthenticated()){
    res.redirect("/epiphanies");
  }else{
  res.render("home.ejs");
}
});

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] }));

app.get('/auth/google/secretsbook', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/epiphanies');
  });

app.get("/login", function(req, res){
  res.render("login.ejs");
});

app.get("/register",function(req, res){
  res.render("register.ejs");
});

app.get("/epiphanies", function(req, res){
  if(req.isAuthenticated()){
    Epiphany.find({},function(err,foundEpiphanies){
      PostVotes.find({},function(err,votesinfo){
        res.render("epiphanies",{feedEpiphanies : foundEpiphanies, currentUser : req.user, postvotes: votesinfo });
      });
    })
  }else{
    res.redirect("/login");
  }
});

app.get("/logout", function(req, res){
  //passport logout method
  req.logout();
  res.redirect("/");
});

app.post("/register", function(req, res){
  //passport register method
  User.register({email : req.body.email, username: req.body.username}, req.body.password, function(err, user){
    if(err){
      console.log(err);
    }else{ 
      passport.authenticate('local')(req, res, function(){
        res.redirect("/epiphanies");
      });
    }
  })
});

app.get("/authenticationfailure", function(req, res){
  res.render("authfail");
});

app.post("/login", function(req, res){
  // passport login method
  const checkUser = new User({
    email : req.body.email,
    password : req.body.password
  });
  req.login(checkUser, function(err){
    if(err){
      res.render("authfail");
    }else{
      passport.authenticate('local')(req, res, function(){
        res.redirect("/epiphanies");
      })
    }
  })
});

app.post("/epiphanies", function(req, res){
  newEpiphany = new Epiphany({
    epiphanyTitle:req.body.epiphanyTitle,
    epiphany: req.body.epiphanyText,
    author:{authorID: req.user.id, authorName: req.user.username},
    epiphanyCategory: req.body.category
  });
  newEpiphany.save(function(err){
    if(!err){
      res.redirect("/epiphanies");
    }else{
      console.log(err);
    }
  });
  User.findById(req.user.id, function(err, foundusers){
    if(foundusers){
      foundusers.epiphanies.push(newEpiphany);
      foundusers.save();
    }else if(err){
      console.log(err);
    }
  });
})

app.post("/vote/:userID/:postID", function(req, res){
  // check vote type
  // check if already voted in the type
    // if so delete the initial vote
  // check if already voted in opposite type
    // if so delete the initial vote from opposite type and add a vote to vote type
  // if not voted in any of sides add a vote to vote type
  User.findById(req.params.userID, function(err, foundUser){
    if(req.body.vote == "upvote"){
      PostVotes.updateOne({"postId": req.params.postID},{
        "$pull": {
          "downvoters": foundUser
        },
      }, (error,result) => {
        if(result.nModified > 0){
          PostVotes.findOneAndUpdate({"postId": req.params.postID}, {"$push":{"upvoters":foundUser},"$inc":{"voteCount":2}},function(err){
            if(err){
              console.log(err);
            }
          });
        }else{
          PostVotes.updateOne({"postId":req.params.postID},
            {
              "$pull": {
                "upvoters":foundUser
              }
            },(err, result2) => {
              if(result2.nModified > 0){
                PostVotes.findOneAndUpdate({"postId": req.params.postID},
                {
                  "$inc":{
                    "voteCount":-1
                  }
                },(err) => {
                  if(err){console.log(err)}
                });
              }else{
                PostVotes.findOne({"postId": req.params.postID},function(err, foundpost){
                  if(foundpost){
                    PostVotes.findOneAndUpdate({"postId": req.params.postID}, {"$push":{"upvoters":foundUser},"$inc":{"voteCount":1}},function(err){
                      if(err){
                        console.log(err);
                      }
                    });
                  }else if(!foundpost){
                    const newPVDoc = new PostVotes({
                      "postId": req.params.postID,
                      "voteCount": 1,
                      "upvoters": [foundUser]
                    });
                    newPVDoc.save();
                  }else if(err){
                    console.log(err);
                  }
                });
            }
          });
        }
      });
    }else if(req.body.vote == "downvote"){
      PostVotes.updateOne({"postId": req.params.postID},{
        "$pull": {
          "upvoters": foundUser
        },
      }, (error,result) => {
        if(result.nModified > 0){
          PostVotes.findOneAndUpdate({"postId": req.params.postID}, {"$push":{"downvoters":foundUser},"$inc":{"voteCount":-2}},function(err){
            if(err){
              console.log(err);
            }
          });
        }else{
          PostVotes.updateOne({"postId": req.params.postID},
            {
              "$pull": {
                "downvoters":foundUser
              }
            },(err, result2) => {
              if(result2.nModified > 0){
                PostVotes.findOneAndUpdate({"postId": req.params.postID},
                {
                  "$inc":{
                    "voteCount":1
                  }
                },(err) => {
                  if(err){console.log(err)}
                });
              }else{
                PostVotes.findOne({"postId": req.params.postID},function(err, foundpost){
                  if(foundpost){
                    PostVotes.findOneAndUpdate({"postId": req.params.postID}, {"$push":{"downvoters":foundUser},"$inc":{"voteCount":-1}},function(err){
                      if(err){
                        console.log(err);
                      }
                    });
                  }else if(!foundpost){
                    const newPVDoc = new PostVotes({
                      "postId": req.params.postID,
                      "voteCount": -1,
                      "downvoters": [foundUser]
                    });
                    newPVDoc.save();
                  }else if(err){
                    console.log(err);
                  }
                });
              }
          });
        }
      });
    }
});
  // res.sendStatus(204);
  res.redirect('/epiphanies')
});

let port = process.env.PORT;
if(port == null || port == ""){
  port = 3000;
}
app.listen(port, function(){
  console.log("server has started");
});