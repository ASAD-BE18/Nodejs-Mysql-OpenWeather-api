const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const cors = require("cors");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const cronJob = require("cron").CronJob;
const { CronJob } = require("cron");
dotenv.config();

const conString = {
  host: "localhost",
  user: "root",
  password: process.env.DB_PWD,
  database: "nodedb",
};

const con = mysql.createConnection(conString);
const app = express();
app.use(bodyParser.json());
app.use(cors());

app.get("/getForecast", function (req, res) {
  const {city} = req.query;
  const weather = `https://api.openweathermap.org/data/2.5/weather?q=${city}&APPID=${process.env.API_KEY}&units=metric`;
  const forecast = `https://api.openweathermap.org/data/2.5/forecast?q=${city}&APPID=${process.env.API_KEY}&units=metric`;

  Promise.all([fetch(weather), fetch(forecast)])
    .then(([res1, res2]) => {
      if (res1.ok && res2.ok) {
        return Promise.all([res1.json(), res2.json()]);
      }
      throw Error(res1.statusText, res2.statusText)
    })
    .then(([data1, data2]) => {
        
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "Nocvember",
        "December",
      ];
      const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const currentDate = new Date();
      const date = `${days[currentDate.getDay()]} ${currentDate.getDate()} ${
        months[currentDate.getMonth()]
      }`;
      const sunset = new Date(data1.sys.sunset * 1000)
        .toLocaleTimeString()
        .slice(0, 5);
      const sunrise = new Date(data1.sys.sunrise * 1000)
        .toLocaleTimeString()
        .slice(0, 5);

      const weatherInfo = {
        city: data1.name,
        country: data1.sys.country,
        date,
        description: data1.weather[0].description,
        main: data1.weather[0].main,
        temp: data1.main.temp,
        highestTemp: data1.main.temp_max,
        lowestTemp: data1.main.temp_min,
        sunrise,
        sunset,
        clouds: data1.clouds.all,
        humidity: data1.main.humidity,
        wind: data1.wind.speed,
        forecast: data2.list,
      };

      res.send(weatherInfo);
    })
    .catch((err) => {
      console.log(err);
      res.send({"msg":"City Not Found"})
    });
});

app.post("/signup", function (req, res) {
  
  const { firstName, lastName, email, city, state } = req.body;
  con.query(
    `Select * from Users where email='${email}'`,
    function (err, rows, fields) {
      if (rows.length != 0) {
        res.send("Email already Exist Please Check your Email");
        return;
      } else {
        const sql = `INSERT INTO USERS (fname,lname,email,city,state) VALUES('${firstName}', '${lastName}','${email}','${city}','${state}')`;
        con.query(sql, function (err, rows, fields) {
          if (!err) res.send("Registration Successful");
          else throw err;
        });
      }
    }
  );
});

app.listen(3001, function () {
  console.log("server is listening port 3001");
});

function getUsers() {
  const emails = "select email,city,state from users";
  let to_list = [];
  return new Promise((res, rej) => {
    con.query(emails, (err, email, fields) => {
      for (k in email) {
        let email_address = email[k].email;
        let city = email[k].city;
        let state = email[k].state
        to_list.push({ email_address, city,state });
      }
      res(to_list);
    });
  });
}

async function main() {
  // Generate test SMTP service account from ethereal.email
  // Only needed if you don't have a real mail account for testing
  let testAccount = await nodemailer.createTestAccount();
  let list = await getUsers();
  // create reusable transporter object using the default SMTP transport
  let transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: testAccount.user, // generated ethereal user
      pass: testAccount.pass, // generated ethereal password
    },
  });

  // send mail with defined transport object
  for (i of list) {
    let fetchedData = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${i.city}&state=${i.state}&APPID=${process.env.API_KEY}&units=metric`
    );
    try{
        fetchedData = await fetchedData.json()
    } catch(e){
        console.log(e)
    }

    console.log(fetchedData);
    let { description,icon } = fetchedData.weather[0];
    let { temp, feels_like, temp_min, temp_max, humidity } = fetchedData.main;
    let info = await transporter.sendMail({
      from: '"Weather Forecast" <foo@example.com>', // sender address
      to: i.email_address, // list of receivers
      subject: "Todays Weather", // Subject line
      html: `<h1>${i.city} Todays Weather</h1>
      <img src= "https://openweathermap.org/img/w/${icon}.png" />
      <br>
      <b> Weather Condition: ${description}<br>
      Temp.: ${temp} C <br>
      Min. Temp. ${temp_min} C <br>
      Max. Temp. ${temp_max} C <br>
      Feels Like: ${feels_like} C <br>
      Humidity: ${humidity} % </b>
      `,
    });

    console.log("Message sent: %s", info.messageId);

    // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

    // Preview only available when sending through an Ethereal account
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    // Preview URL: https://ethereal.email/message/WaQKMgKddxQDoou...
  }
}

const job = new CronJob("10 * * * * *", () => {
  //let mylist = sendEmails();
  main().catch(console.error);
});

job.start();
