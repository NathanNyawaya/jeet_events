import jwt from "jsonwebtoken";
import prisma from "./../prisma/prisma.js";
import md5 from "md5";
import sendOtpViaSMS from "../utils/sendOtpViaSms.js";

import {
  randomNumber,
  randomString,
  timeCreate,
  isNumber,
  ipAddress,
} from "./../utils/randomGenerate.js";

export const login = async (req, res, next) => {
  const { phone, password: pwd } = req.body;
  //console.log(phone, pwd);
  if (!phone || !pwd) {
    return res.status(400).json({
      message: "Bad Request: Missing required parameters",
      status: false,
    });
  }
  if (phone.length < 9 || phone.length > 10 || !isNumber(phone)) {
    return res.status(400).json({
      message: "phone error",
      status: false,
    });
  }

  try {
    const user = await prisma.users.findFirst({
      where: {
        phone: String(phone),
      },
    });

    if (!user) {
      return res.status(401).json({
        message: "Incorrect phone or Password",
        status: false,
      });
    }

    // Use md5 to hash the password
    const hashedPassword = md5(pwd);
    if (hashedPassword === user.password) {
      const accessToken = jwt.sign(
        {
          phone: user.phone,
        },
        process.env.JWT_ACCESS_TOKEN,
        { expiresIn: "365d" }
      );
      //console.log(accessToken);

      await prisma.users.updateMany({
        where: {
          phone: String(phone),
        },
        data: {
          token: accessToken,
        },
      });

      return res.status(200).json({
        message: "Login Success",
        status: true,
        token: accessToken,
        value: accessToken,
      });
    } else {
      return res.status(401).json({
        message: "Account has been locked or Incorrect phone or Password",
        status: false,
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      status: false,
    });
  }
};

export const register = async (req, res, next) => {
  let now = new Date().getTime();
  let {
    phone,
    password: pwd,
    promocode: invitecode,
    otp,
    email,
    gender,
    name,
  } = req.body;
  let id_user = randomNumber(10000, 99999);
  let name_user = "Member" + randomNumber(10000, 99999);
  let code = randomString(5) + randomNumber(10000, 99999);
  let ip = ipAddress(req);
  let time = timeCreate();
  if (!phone || !pwd || !otp) {
    return res.status(400).json({
      message: "DATA ERROR!!!",
      status: false,
    });
  }
  const password = md5(pwd);
  if (phone.length < 9 || phone.length > 10 || !isNumber(phone)) {
    return res.status(400).json({
      message: "Phone number must be equal to 9 or 10 digits",
      status: false,
    });
  }

  try {
    const checkUser = await prisma.users.findFirst({
      where: {
        phone: String(phone),
      },
    });

    let checkInvite;
    invitecode
      ? (checkInvite = await prisma.users.count({
          where: {
            code: invitecode,
          },
        }))
      : (checkInvite = 0);

    let invitecode1 = checkInvite ? invitecode : "let limit = 20;";
    if (!checkUser) {
      return res.status(400).json({
        message: "Invalid Otp",
        status: false,
        timeStamp: now,
      });
    } else {
      let user = checkUser;

      if (user.time_otp && new Date(user.time_otp).getTime() - now > 0) {
        await prisma.users.deleteMany({
          where: {
            phone: String(phone),
          },
        });
        const referDetails = await prisma.refer.findMany();
        const parentCommission = referDetails[0].parentCommission;
        const notReferCommision = referDetails[0].notReferCommission;
        const friendCommission = referDetails[0].friendCommission;
        await prisma.users.updateMany({
          where: { code: invitecode1 },
          data: {
            money: {
              increment: parentCommission,
            },
          },
        });
        let money;
        if (invitecode1 === "MYJEETWIN") {
          money = notReferCommision;
        } else {
          money = friendCommission;
        }
        await prisma.users.create({
          data: {
            id_user,
            phone: phone,
            name_user,
            password: password,
            money: money,
            code,
            invite: invitecode1,
            veri: 1,
            otp,
            ip_address: ip,
            status: 0,
            time,
            // email,
            // gender,
            // name,
          },
        });
        return res.status(200).json({
          message: "Registeration Successfull",
          status: true,
        });
      } else {
        return res.status(400).json({
          message: "Otp has been expired...",
          status: false,
          timeStamp: now,
        });
      }
    }
  } catch (error) {
    // console.log(error);
    return res.status(500).json({
      message: "Internal Server Error",
      status: false,
    });
  }
};

export const verifyCode = async (req, res, next) => {
  const phone = req.body.phone;
  // Constants for better readability
  const otp = randomNumber(100000, 999999);
  const now = Date.now();
  const OTP_VALIDITY_DURATION = 2 * 60 * 1000 + 500; // Removed the timeEnd calculation
  if (!phone) {
    return res.status(400).json({
      message: "Phone number must be equal to 9 or 10 digits",
      status: false,
    });
  }
  if (phone?.length < 9 || phone?.length > 10 || !isNumber(phone)) {
    return res.status(400).json({
      message: "Phone number must be equal to 9 or 10 digits",
      status: false,
    });
  }

  try {
    // Always send a new OTP, regardless of whether the user exists or not
    const data = await sendOtpViaSMS(
      phone,
      otp,
      now + OTP_VALIDITY_DURATION,
      res
    );
    if (data === false) {
      return res.status(200).json({
        message: "Fast2Sms Api Error!..",
        status: false,
        timeStamp: now,
      });
    }

    // Update or create user record
    await prisma.users.upsert({
      where: { phone: phone },
      update: {
        otp,
        time_otp: new Date(now + OTP_VALIDITY_DURATION).toISOString(),
      },
      create: {
        phone,
        otp,
        veri: 0,
        time_otp: new Date(now + OTP_VALIDITY_DURATION).toISOString(),
      },
    });

    return res.status(200).json({
      message: "SMS sent successfully",
      status: true,
      timeStamp: now,
      timeEnd: now + OTP_VALIDITY_DURATION,
    });
  } catch (error) {
    console.error("Error in verifyCode:", error);
    return res.status(500).json({
      message: "Internal server error",
      status: false,
    });
  }
};

export const verifyCodePass = async (req, res) => {
  let phone = req.body.phone;
  let now = new Date().getTime();
  let timeEnd = +new Date() + 1000 * (60 * 2 + 0) + 500;
  let otp = randomNumber(100000, 999999);

  if (phone.length < 9 || phone.length > 10 || !isNumber(phone)) {
    return res.status(400).json({
      message: "Phone number must be equal to 9 or 10 digits",
      status: false,
    });
  }

  try {
    const users = await prisma.users.findMany({
      where: {
        phone: String(phone),
      },
    });
    const user = users[0];
    if (!user) {
      return res.status(200).json({
        message: "Account does not exist",
        status: false,
        timeStamp: now,
      });
    }

    if (user.time_otp && new Date(user.time_otp).getTime() - now <= 0) {
      const data = await sendOtpViaSMS(phone, otp, timeEnd, res);
      if (data === false) {
        return res.status(200).json({
          message: "Fast2Sms Api Error!..",
          status: false,
          timeStamp: now,
        });
      }
      if (data.message == "SMS sent successfully.") {
        await prisma.users.updateMany({
          where: {
            phone: String(phone),
          },
          data: {
            otp: otp,
            time_otp: new Date(timeEnd).toISOString(),
          },
        });
        return res.status(200).json({
          message: "Submitted successfully",
          status: true,
          timeStamp: now,
          timeEnd: timeEnd,
        });
      }
    } else {
      return res.status(200).json({
        message: "Send SMS regularly",
        status: false,
        timeStamp: now,
      });
    }
  } catch (error) {
    //console.log(error);
  }
};

export const forGotPassword = async (req, res) => {
  let phone = req.body.phone;
  let otp = req.body.otp;
  let pwd = req.body.pwd;
  //console.log(req.body);
  let now = new Date().getTime();
  let timeEnd = +new Date() + 1000 * (60 * 2 + 0) + 500;
  let otp2 = randomNumber(100000, 999999);

  if (phone.length < 9 || phone.length > 10 || !isNumber(phone)) {
    return res.status(400).json({
      message: "phone error",
      status: false,
    });
  }

  try {
    const users = await prisma.users.findMany({
      where: {
        phone: String(phone),
      },
    });
    const user = users[0];
    if (!user) {
      return res.status(200).json({
        message: "Account does not exist",
        status: false,
        timeStamp: now,
      });
    }
    if (user.time_otp && new Date(user.time_otp).getTime() - now > 0) {
      if (user.otp == otp) {
        const user = await prisma.users.updateMany({
          where: {
            phone: String(phone),
          },
          data: {
            password: md5(pwd),
            otp: otp2,
            time_otp: new Date(timeEnd).toISOString(),
          },
        });

        return res.status(200).json({
          message: "Change password successfully",
          status: true,
          timeStamp: now,
          timeEnd: timeEnd,
        });
      } else {
        return res.status(200).json({
          message: "OTP code is incorrect",
          status: false,
          timeStamp: now,
        });
      }
    } else {
      return res.status(200).json({
        message: "OTP code has expired",
        status: false,
        timeStamp: now,
      });
    }
  } catch (error) {
    //console.log(error);
    return res.status(500).json({
      message: "Internal Server Error",
      status: false,
    });
  }
};
