import Feedback from '../../models/Feedback.js';
import User from '../../models/User.js';

// Get all posts for admin moderation
export const getAllPostsAdmin = async (req, res) => {
  try {
    console.log('Admin community request received');
    console.log('Admin user:', req.admin);
    
    const posts = await Feedback.find()
      .populate('user_id', 'name email avatar')
      .populate('comments.user_id', 'name email avatar')
      .sort({ createdAt: -1 });

    console.log(`Found ${posts.length} posts for admin`);
    
    res.status(200).json({ 
      success: true,
      posts: posts,
      count: posts.length
    });
  } catch (error) {
    console.error('Error in getAllPostsAdmin:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching posts', 
      error: error.message 
    });
  }
};

// Admin delete any post
export const deletePostAdmin = async (req, res) => {
  try {
    const { postId } = req.params;
    console.log('Admin deleting post:', postId);

    const post = await Feedback.findById(postId).populate('user_id', 'name email');
    if (!post) {
      return res.status(404).json({ 
        success: false,
        message: 'Post not found' 
      });
    }

    const postOwnerId = post.user_id._id;
    const postOwnerName = post.user_id.name;
    
    console.log(`Deleting post by ${postOwnerName} (${postOwnerId})`);

    // Delete the post
    await Feedback.findByIdAndDelete(postId);

    // Deduct points from post owner
    await User.findByIdAndUpdate(postOwnerId, {
      $inc: { 
        points: -5,
        'communityActivity.postsCreated': -1
      }
    });

    console.log('Post deleted and points deducted');
    res.json({ 
      success: true,
      message: `Post deleted successfully. 5 points deducted from ${postOwnerName}` 
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting post', 
      error: error.message 
    });
  }
};

// Admin delete any comment
export const deleteCommentAdmin = async (req, res) => {
  try {
    const { commentId } = req.params;
    console.log('Admin deleting comment:', commentId);

    const post = await Feedback.findOne({ 'comments._id': commentId })
      .populate('comments.user_id', 'name email');
    
    if (!post) {
      return res.status(404).json({ 
        success: false,
        message: 'Comment not found' 
      });
    }

    const comment = post.comments.id(commentId);
    const commentOwnerId = comment.user_id._id;
    const commentOwnerName = comment.user_id.name;
    
    console.log(`Deleting comment by ${commentOwnerName} (${commentOwnerId})`);

    // Remove comment
    post.comments.pull(commentId);
    await post.save();

    // Deduct points from comment owner
    await User.findByIdAndUpdate(commentOwnerId, {
      $inc: { 
        points: -2,
        'communityActivity.commentsMade': -1
      }
    });

    console.log('Comment deleted and points deducted');
    res.json({ 
      success: true,
      message: `Comment deleted successfully. 2 points deducted from ${commentOwnerName}` 
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting comment', 
      error: error.message 
    });
  }
};

// Admin get leaderboard (no subscription check)
export const getLeaderboardAdmin = async (req, res) => {
  try {
    console.log('Admin fetching leaderboard...');
    
    const leaderboard = await User.find({ points: { $gt: 0 } })
      .select('name avatar points communityActivity')
      .sort({ points: -1 })
      .limit(50);

    console.log(`Found ${leaderboard.length} users in leaderboard`);
    res.json({ 
      success: true,
      leaderboard, 
      count: leaderboard.length 
    });
  } catch (error) {
    console.error('Error fetching admin leaderboard:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching leaderboard', 
      error: error.message 
    });
  }
};

// Admin get community stats (no subscription check)
export const getCommunityStatsAdmin = async (req, res) => {
  try {
    console.log('Admin fetching community stats...');
    
    const stats = await Promise.all([
      Feedback.countDocuments(),
      Feedback.aggregate([{ $unwind: '$comments' }, { $count: 'total' }]),
      Feedback.aggregate([{ $unwind: '$likes' }, { $count: 'total' }]),
      User.countDocuments({ points: { $gt: 0 } })
    ]);

    const result = {
      totalPosts: stats[0],
      totalComments: stats[1][0]?.total || 0,
      totalLikes: stats[2][0]?.total || 0,
      activeMembers: stats[3]
    };
    
    console.log('Community stats:', result);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching admin community stats:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching community stats', 
      error: error.message 
    });
  }
};