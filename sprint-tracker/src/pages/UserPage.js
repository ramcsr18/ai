// pages/UserPage.js
import MemberTasks from "../components/Dashboard/MemberTasks";
function UserPage() {
  return (
    <div>
      <h2>User Dashboard</h2>
      <MemberTasks />
      {/* User-specific updates */}
    </div>
  );
}
export default UserPage;