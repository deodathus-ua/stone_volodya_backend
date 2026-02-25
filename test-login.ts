import axios from "axios";

async function testLogin() {
    try {
        const initData = "query_id=AAFRv3kTAAAAABG_eRNNqjD_&user=%7B%22id%22%3A326615825%2C%22first_name%22%3A%22Daniil%22%2C%22last_name%22%3A%22%22%2C%22username%22%3A%22Daniil_Volkov%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%2C%22allows_write_to_pm%22%3Atrue%7D&auth_date=1715000000&hash=d1e370df2a492167d302db1d8d9b28a2a781fa0e72bd68daceb6edaf6f54c9da";
        
        console.log("Testing Login...");
        const loginRes = await axios.post("http://localhost:3000/api/auth/login", { initData });
        console.log("Login Response Status:", loginRes.status);
        console.log("Login Response Data:", loginRes.data);

        const token = loginRes.data.token;
        if (!token) {
            console.log("No token received");
            return;
        }

        console.log("\nTesting Get Profile...");
        const profileRes = await axios.get("http://localhost:3000/api/user/profile", {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("Profile Response Status:", profileRes.status);
        console.log("Profile Response Data:", profileRes.data);

    } catch (error: any) {
        console.error("Test Error:", error.response?.data || error.message);
    }
}

testLogin();
