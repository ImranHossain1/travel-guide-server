const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');
const res = require('express/lib/response');
const req = require('express/lib/request');

const app= express();
app.use(cors());
app.use(express.json());
//app.use(cors({origin: 'https://tourism-guide-ddb6e.firebaseapp.com'}))

const port = process.env.PORT || 5000
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6hmhs.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next){
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send({message: 'Unauthorized Access'})
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
    if(err){
      return res.status(403).send({message:"Forbidden Access"})
    }
    req.decoded= decoded;
    next();
  });
}

const emailSenderOptions = {
  auth: {
    api_key: process.env.EMAIL_SENDER_KEY
  }
}
const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));

function sendConfirmBookingEmail(confirmBooking){
    const {userEmail, userName, bookingName, date} = confirmBooking;
    //console.log(confirmBooking)
    var email = {
      from: process.env.EMAIL_SENDER,
      to: userEmail,
      subject: `Your Booking for ${bookingName} is on ${date} is confirmed`,
      text: `Your Booking for ${bookingName} is on ${date} is confirmed`,
      html: `
        <div>
          <h1>Hello ${userName}</h1>
          <h3>Your Appointment for ${bookingName} is Confirmed</h3>
          <p>Looking Forword to see you on ${date}</p>
          <h3>Our Address</h3>
          <p>Ginnheimer Landstr 42</p>
          <p>Frankfurt Am Main</p>
          <p>Germany</p>
          <a href="https://www.facebook.com/imran1402/">Unsubscribe</a>
        </div>`
    };
    emailClient.sendMail(email, function(err, info){
      if (err ){
        console.log(err);
      }
      else {
        console.log('Message sent: ' , info);
      }
    });
}
/* function sendEmergencyEmail(mail){
    const {senderEmail, subject, body} = mail;
    //console.log(confirmBooking)
    var email = {
      from: senderEmail,
      to: process.env.EMAIL_SENDER,
      subject: {subject},
      text: {subject},
      html: `
        <div>
          <p>${body}</p>
        </div>`
    };
    emailClient.sendMail(email, function(err, info){
      if (err){
        console.log(err);
      }
      else{
        console.log('Message sent: ' , info);
      }
    });
} */
function sendPaymentConfirmationEmail(booking){
  const {userEmail, userName, bookingName, date} = booking;
  var email = {
    from: process.env.EMAIL_SENDER,
    to: userEmail,
    subject: `We have received your payment for ${bookingName} is on ${date} is confirmed`,
    text: `Your payment for this Appointment for ${bookingName} is on ${date} is confirmed`,
    html: `
      <div>
        <h1>Hello ${userName}</h1>
        <h3>Thank you for your payment.</h3>
        <p>We have received your payment ${date}</p>
        <h3>Our Address</h3>
        <p>Ginnheimer Landstr 42</p>
        <p>Frankfurt Am Main</p>
        <p>Germany</p>
        <a href="https://www.facebook.com/imran1402/">Unsubscribe</a>
      </div>`
  };
  emailClient.sendMail(email, function(err, info){
    if (err ){
      console.log(err);
    }
    else {
      console.log('Message sent: ' , info);
    }
  });
}

async function run(){
  try{
    await client.connect();
    const destinationCollection = client.db('TravelGuide').collection('destinations');
    const bookedDestinationCollection = client.db('TravelGuide').collection('booking');
    const photosCollection = client.db('TravelGuide').collection('photos');
    const reviewCollection = client.db('TravelGuide').collection('reviews');
    const userCollection = client.db('TravelGuide').collection('users');
    const paymentCollection = client.db('TravelGuide').collection('payments');
    const messagesCollection = client.db('TravelGuide').collection('messages');

    const verifyAdmin = async(req, res, next)=>{
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({email: requester})
      if(requesterAccount.role==='admin'){
        next();
      }
      else{
        return res.status(403).send({message: 'Forbidden Access'});
      }
    }

    app.get('/destination', async(req,res)=>{
      const query= {};
      const cursor= destinationCollection.find(query);
      const destinations =await cursor.toArray();
      res.send(destinations);
    })
    app.get('/destination/:id', async(req,res)=>{
      const id = req.params.id;
      const query= {_id: ObjectId(id)};
      const destination = await destinationCollection.findOne(query);
      res.send(destination);
    })

    //delete Destinations
    app.delete('/destination/:id',verifyJWT, verifyAdmin, async(req,res)=>{
      const id = req.params.id;
      const filter = {_id:ObjectId(id)}
      const result = await destinationCollection.deleteOne(filter);
      res.send(result);
    })
    // Add New Travel Destination
    app.post('/destination',verifyJWT,verifyAdmin, async(req,res)=>{
      const destination = req.body;
      const result = await destinationCollection.insertOne(destination);
      res.send(result)
    })

    app.get('/photos', async(req,res)=>{
      const query= {};
      const cursor= photosCollection.find(query);
      const photos =await cursor.toArray();
      res.send(photos);
    })

    app.get('/destinationPhoto/:name', async(req,res)=>{
      const name = req.params.name;
      const query ={ place: name};
      const photos =await photosCollection.find(query).toArray();
      res.send(photos)
    })
    app.post('/photos',verifyJWT, async(req,res)=>{
      const photo = req.body;
      const result = await photosCollection.insertOne(photo);
      res.send(result)
    })

    //add user information to the database
    app.put('/user/:email', async(req,res)=>{
      const email = req.params.email;
      const user = req.body;
      const filter = {email: email};
      const options = {upsert : true};
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc,options);
      const token= jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({result, token});
    })
    //Get perticular User
    app.get('/user/:email',verifyJWT, async(req, res)=>{
      const email= req.params.email;
      const filter = {email: email};
      const result = await userCollection.findOne(filter);
      res.send(result)
    })

    // Get users from DB
    app.get('/users', verifyJWT,verifyAdmin, async(req,res)=>{
      const users = await userCollection.find().toArray();
      res.send(users);
    })
    //add a new booking user 
    app.post('/bookedDestination',verifyJWT, async(req,res)=>{
      const confirmBooking = req.body;
      
      const query = {date: confirmBooking.date, userName: confirmBooking.userName};
      //console.log(query)
      const exists = await bookedDestinationCollection.findOne(query);
       if(exists){
          console.log(exists)
           return res.send({success: false, confirmBooking: exists})
       }
      const result =await bookedDestinationCollection.insertOne(confirmBooking);
      sendConfirmBookingEmail(confirmBooking)
      return res.send({success: true,result});
    })


    app.get('/user', verifyJWT,verifyAdmin, async(req,res)=>{
      const user = await userCollection.find().toArray();
      res.send(user);
    })
    //verify user role
    app.get('/admin/:email',verifyJWT, async(req,res)=>{
      const email = req.params.email;
      const user = await userCollection.findOne({email:email})
      const isAdmin = user.role ==='admin';
      res.send({admin: isAdmin});
    })
    //add user role as ADMIN
    app.put('/user/admin/:email',verifyJWT, verifyAdmin, async(req,res)=>{
      const email= req.params.email;
      const filter= {email: email}
      const updatedDoc = {
        $set: {role: 'admin'}
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send({result});
    })

    //get user bookings from DB

    app.get('/booking/:email',verifyJWT, async(req,res)=>{
        const email = req.params.email;
        const query = {userEmail: email}
        const bookings = await bookedDestinationCollection.find(query).toArray();
        res.send(bookings);
    })

    app.get('/booking/:id',verifyJWT, async(req,res)=>{
      const id = req.params.id;
      const query ={ _id: ObjectId(id)};
      const booking =await bookedDestinationCollection.findOne(query);
      res.send(booking)
    })
    app.delete('/booking/:id',verifyJWT, verifyAdmin, async(req,res)=>{
      const id = req.params.id;
      const filter = {_id:ObjectId(id)}
      const result = await bookedDestinationCollection.deleteOne(filter);
      res.send(result);
    })
    //Post Review
    app.post('/review',verifyJWT, async(req,res)=>{
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result)
    })
    app.get('/review', async(req,res)=>{
      const review = await reviewCollection.find().toArray();
      res.send(review)
    })

    //Payment
    app.patch('/booking/:id', async(req,res)=>{
      const id = req.params.id;
      const payment = req.body;
      const filter ={_id : ObjectId(id)};;
      const updatedDoc = {
        $set : {
          paid: true,
          transactionId: payment.transactionId
        }
      }
      const result = await paymentCollection.insertOne(payment);
      const updatedBooking = await bookedDestinationCollection.updateOne(filter, updatedDoc);
      const booking = await bookedDestinationCollection.findOne(filter);
      sendPaymentConfirmationEmail(booking);
      res.send(updatedDoc)
    })
    app.post('/create-payment-intent', async(req,res)=>{
      const booking = req.body;
      const cost = booking.cost;
      const amount = cost*100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "eur",
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })
    app.post('/email', async(req, res)=>{
      mail = req.body;
      const result = await messagesCollection.insertOne(mail);
      res.send(result);
    })
    app.get('/notifications',verifyJWT, async(req, res)=>{
      const result = await messagesCollection.find().toArray();
      res.send(result)
    })
    app.get('/notification/:id',verifyJWT, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      //console.log(id);
      const query ={ _id: ObjectId(id)};
      const result =await messagesCollection.findOne(query);
      res.send(result)
    })
    app.patch('/notification/:id',verifyJWT, verifyAdmin, async(req, res)=>{
      const id= req.params.id;
      const status= req.body
      const filter ={_id : ObjectId(id)};;
      const updatedDoc = {
        $set : {
          unread: status.unread,
        }
      }
      const result = await messagesCollection.updateOne(filter, updatedDoc);
      res.send(result)
    })
    app.delete('/notification/:id',verifyJWT, verifyAdmin, async(req,res)=>{
      const id = req.params.id;
      const filter = {_id:ObjectId(id)}
      const result = await messagesCollection.deleteOne(filter);
      res.send(result);
    })
  }
  finally{

  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello from Travel Guide DE!')
})

app.listen(port, () => {
  console.log(`Travel Guide DE app listening on port ${port}`)
})